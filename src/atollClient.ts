// libraries
import type {
    ApiMapItem,
    ApiMapServerResponse,
    ApiResourceItemLink,
    AuthServerResponse,
    ProjectResourceItem,
    ProjectsServerResponse,
    SprintBacklogItemsServerResponse,
    SprintBacklogResourceItem,
    SprintResourceItem,
    SprintServerResponse
} from "@atoll/api-types";
import type { RestApiFetchError, RestApiFetchErrorType } from "@atoll/rest-fetch";
import { HostNotificationHandler } from "./atollClientTypes";

// utils
import { restApi, setupAuthFailureHandler } from "./restApi";

export const LOGIN_RELATIVE_URL = "/api/v1/actions/login";
export const MAP_RELATIVE_URL = "/api/v1";

export class AtollClient {
    private connecting: boolean = false;
    public refreshToken: string | null = null;
    private apiMap: { [key: string]: ApiMapItem } | null = null;
    private canonicalHostBaseUrl: string | null = null;
    private notificationHandler: HostNotificationHandler | null = null;
    constructor() {}
    /**
     * Get an API Map to determine endpoints of resources on-the-fly.
     * @param hostBaseUrl this is needed because this particular API call happens before the canonicalHostBaseUrl is set
     * @returns An API Map list.
     */
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
    private async onAuthFailureNotification(refreshTokenUri: string): Promise<void> {
        if (this.notificationHandler) {
            await this.notificationHandler("Re-connecting to Atoll Server...", "info");
        }
    }
    private async onRefreshTokenSuccessNotification(newAuthToken: string, newRefreshToken: string): Promise<void> {
        if (this.notificationHandler) {
            await this.notificationHandler("Re-connected to Atoll Server", "info");
        }
    }
    private async onRefreshTokenFailureNotification(oldRefreshToken: string): Promise<void> {
        if (this.notificationHandler) {
            await this.notificationHandler("Unable to re-connect to Atoll Server - trying signing in again", "warn");
        }
    }
    private setupRestApiHandlers() {
        const refreshTokenUri = this.lookupUriFromApiMap("refresh-token", "action");
        setupAuthFailureHandler(
            refreshTokenUri,
            this.onAuthFailureNotification,
            this.onRefreshTokenSuccessNotification,
            this.onRefreshTokenFailureNotification
        );
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
    // TODO: Find a way to set up a "bridge" to send notifications back to the consumer (e.g. VS Code)
    public async connect(
        hostBaseUrl: string,
        username: string,
        password: string,
        notificationHandler: HostNotificationHandler
    ): Promise<string | null> {
        if (this.connecting) {
            throw new Error("Another connection is already in progress!");
        }
        const canonicalHostBaseUrl = this.canonicalizeUrl(hostBaseUrl);
        await this.buildApiMapIndex(canonicalHostBaseUrl);
        await this.setupRestApiHandlers();
        this.notificationHandler = notificationHandler;
        const authUrl = this.lookupUriFromApiMap("user-auth", "action");
        this.connecting = true;
        const loginActionUri = `${canonicalHostBaseUrl}${authUrl}`;
        const loginPayload = { username, password };

        try {
            const response = await restApi.execAction<AuthServerResponse>(loginActionUri, loginPayload);
            this.connecting = false;
            restApi.setDefaultHeader("Authorization", `Bearer  ${response.data.item.authToken}`);
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
            this.refreshToken = null;
        }
    }
    public isConnecting(): boolean {
        return this.connecting;
    }
    public isConnected(): boolean {
        return !!this.refreshToken;
    }
    public async fetchProjects(): Promise<ProjectResourceItem[]> {
        const projectsUri = this.lookupUriFromApiMap("projects", "collection");
        const result = await restApi.get<ProjectsServerResponse>(`${this.canonicalHostBaseUrl}${projectsUri}`);
        return result.data.items;
    }
    public async fetchSprintByUri(sprintUri: string): Promise<SprintResourceItem> {
        const result = await restApi.get<SprintServerResponse>(`${this.canonicalHostBaseUrl}${sprintUri}`);
        return result.data.item;
    }
    public async fetchSprintBacklogItemsByUri(sprintBacklogItemsUri: string): Promise<SprintBacklogResourceItem[]> {
        const result = await restApi.get<SprintBacklogItemsServerResponse>(`${this.canonicalHostBaseUrl}${sprintBacklogItemsUri}`);
        return result.data.items;
    }
    public findLinkByRel(links: ApiResourceItemLink[], rel: string): ApiResourceItemLink | null {
        const matchingLinks = links.filter((link) => link.rel === rel);
        const matchingLinkCount = matchingLinks.length;
        if (matchingLinkCount === 0) {
            return null;
        } else if (matchingLinkCount > 1) {
            throw new Error(`findLinkUrlByRel(links, "${rel}") matched ${matchingLinkCount} - expecting 1!`);
        } else {
            return matchingLinks[0];
        }
    }
    public findLinkUriByRel(links: ApiResourceItemLink[], rel: string): string | null {
        const link = this.findLinkByRel(links, rel);
        if (link === null) {
            return null;
        }
        return link.uri;
    }
}
