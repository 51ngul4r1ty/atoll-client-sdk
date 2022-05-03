// libraries
import type {
    ApiMapItem,
    ApiMapServerResponse,
    AuthServerResponse,
    ProjectResourceItem,
    ProjectsServerResponse
} from "@atoll/api-types";

// utils
import { restApi } from "./restApi";
import { RestApiFetchError, RestApiFetchErrorType } from "@atoll/rest-fetch";

export const LOGIN_RELATIVE_URL = "/api/v1/actions/login";
export const MAP_RELATIVE_URL = "/api/v1";

export class AtollClient {
    private connecting: boolean = false;
    private authToken: string | null = null;
    private refreshToken: string | null = null;
    private apiMap: { [key: string]: ApiMapItem } | null = null;
    private canonicalHostBaseUrl: string | null = null;
    constructor() {}
    private async getApiMap(hostBaseUrl: string): Promise<ApiMapItem[]> {
        const result = await restApi.get<ApiMapServerResponse>(`${hostBaseUrl}${MAP_RELATIVE_URL}`);
        return result.data.items;
    }
    private lookupUriFromApiMap(id: string, rel: string): string {
        if (!this.apiMap) {
            throw new Error("API Map needs to be retrieved first!");
        }
        const endpointMapItem = this.apiMap[id];
        if (!endpointMapItem) {
            throw new Error(`Unable to find API Map Item with ID "${id}"`);
        }
        const matchingActions = endpointMapItem.links.filter((link) => link.rel === rel);
        if (matchingActions.length === 0) {
            throw new Error(`Unable to find a matching API Map Item Link with rel "${rel}"`);
        }
        if (matchingActions.length > 1) {
            throw new Error(`Found ${matchingActions.length} matching API Map Item Links with rel "${rel}"`);
        }
        return matchingActions[0].uri;
    }
    private async buildApiMapIndex(hostBaseUrl: string) {
        const apiMapResponse = await this.getApiMap(hostBaseUrl);
        this.apiMap = {};
        apiMapResponse.forEach((apiMapItem) => {
            this.apiMap[apiMapItem.id] = apiMapItem;
        });
    }
    private canonicalizeUrl(url: string): string {
        return url.endsWith("/") ? url.substring(0, url.length - 1) : url;
    }

    private buildErrorResult(error: any, functionName: string) {
        const errorTyped = error as RestApiFetchError;
        if (errorTyped.errorType === RestApiFetchErrorType.UnexpectedError) {
            throw new Error(`${errorTyped.message} (${functionName})`);
        }
        const status = errorTyped.status;
        const message = errorTyped.message;
        return `Atoll REST API error: ${status} - ${message} (${functionName})`;
    }

    /**
     * Authenticate user on the provided Atoll host server.
     * @param hostBaseUrl for example, https://atoll.yourdomain.com/
     * @param username a valid user in Atoll database
     * @param password password for the provided username
     * @returns message if there's an error, otherwise null
     */
    public async connect(hostBaseUrl: string, username: string, password: string): Promise<string | null> {
        if (this.connecting) {
            throw new Error("Another connection is already in progress!");
        }
        const canonicalHostBaseUrl = this.canonicalizeUrl(hostBaseUrl);
        await this.buildApiMapIndex(canonicalHostBaseUrl);
        const authUrl = this.lookupUriFromApiMap("user-auth", "action");
        this.connecting = true;
        const loginActionUri = `${canonicalHostBaseUrl}${authUrl}`;
        const loginPayload = { username, password };

        try {
            const response = await restApi.execAction<AuthServerResponse>(loginActionUri, loginPayload);
            this.connecting = false;
            this.authToken = response.data.item.authToken;
            this.refreshToken = response.data.item.refreshToken;
            this.canonicalHostBaseUrl = canonicalHostBaseUrl;
            return null;
        } catch (error) {
            this.connecting = false;
            return this.buildErrorResult(error, "connect");
        }
    }
    public disconnect() {
        if (this.isConnecting()) {
            throw new Error("Unable to disconnect while connection is being established!");
        }
        if (this.isConnected()) {
            this.authToken = null;
            this.refreshToken = null;
        }
    }
    public isConnecting(): boolean {
        return this.connecting;
    }
    public isConnected(): boolean {
        return !!this.authToken;
    }
    public async fetchProjects(): Promise<ProjectResourceItem[]> {
        const projectsUrl = this.lookupUriFromApiMap("projects", "collection");
        const result = await restApi.get<ProjectsServerResponse>(projectsUrl);
        return result.data.items;
    }
}
