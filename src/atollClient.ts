// externals
import { StatusCodes } from "http-status-codes";

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
import { isRestApiFetchError, RestApiFetchError } from "@atoll/rest-fetch";
import type { HostNotificationHandler } from "./atollClientTypes";
import { RestApiFetchErrorType } from "@atoll/rest-fetch";

// utils
import { restApi } from "./restApi";
import { isValidFullUri } from "./validationUtils";

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
    private getApiMap = async (hostBaseUrl: string): Promise<ApiMapItem[]> => {
        const result = await restApi.get<ApiMapServerResponse>(`${hostBaseUrl}${MAP_RELATIVE_URL}`);
        return result.data.items;
    };
    private lookupUriFromApiMap = (id: string, rel: string): string => {
        if (!this.canonicalHostBaseUrl) {
            throw new Error("Unable to look up a URI without the host base URL being set first!");
        }
        const uri = this.lookupRelativeUriFromApiMap(id, rel);
        return `${this.canonicalHostBaseUrl}${uri}`;
    };
    private lookupRelativeUriFromApiMap = (id: string, rel: string): string => {
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
    };
    private fetchApiMapAndBuildIndex = async (hostBaseUrl: string) => {
        const apiMapResponse = await this.getApiMap(hostBaseUrl);
        this.apiMap = {};
        apiMapResponse.forEach((apiMapItem) => {
            this.apiMap[apiMapItem.id] = apiMapItem;
        });
    };
    private onAuthFailureNotification = async (refreshTokenUri: string): Promise<void> => {
        if (this.notificationHandler) {
            await this.notificationHandler("Re-connecting to Atoll Server...", "info");
        }
    };
    private onRefreshTokenSuccessNotification = async (newAuthToken: string, newRefreshToken: string): Promise<void> => {
        if (this.notificationHandler) {
            await this.notificationHandler("Re-connected to Atoll Server", "info");
        }
    };
    private onRefreshTokenFailureNotification = async (oldRefreshToken: string): Promise<void> => {
        if (this.notificationHandler) {
            await this.notificationHandler("Unable to re-connect to Atoll Server - trying signing in again", "warn");
        }
    };
    private fetchAuthTokenUsingRefreshToken = async (
        refreshTokenUri: string
    ): Promise<{ authToken: string; refreshToken: string }> => {
        const result = await restApi.execAction<AuthServerResponse>(
            refreshTokenUri,
            { refreshToken: this.refreshToken },
            { skipRetryOnAuthFailure: true }
        );
        const { authToken, refreshToken } = result.data.item;
        this.refreshToken = refreshToken;
        restApi.setDefaultHeader("Authorization", `Bearer  ${authToken}`);
        return {
            authToken,
            refreshToken
        };
    };
    private setupAuthFailureHandler = (refreshTokenUri: string) => {
        restApi.onAuthFailure = async () => {
            await this.onAuthFailureNotification(refreshTokenUri);
            try {
                const { authToken, refreshToken } = await this.fetchAuthTokenUsingRefreshToken(refreshTokenUri);
                await this.onRefreshTokenSuccessNotification(authToken, refreshToken);
                return true;
            } catch (error) {
                await this.onRefreshTokenFailureNotification(this.refreshToken);
                return false;
            }
        };
    };
    private setupTokenRefresher = (canonicalHostBaseUrl?: string) => {
        let refreshTokenUri: string;
        if (canonicalHostBaseUrl) {
            const relativeTokenUri = this.lookupRelativeUriFromApiMap("refresh-token", "action");
            refreshTokenUri = `${canonicalHostBaseUrl}${relativeTokenUri}`;
        } else {
            refreshTokenUri = this.lookupUriFromApiMap("refresh-token", "action");
        }
        this.setupAuthFailureHandler(refreshTokenUri);
    };
    private canonicalizeUrl = (url: string): string => {
        return url.endsWith("/") ? url.substring(0, url.length - 1) : url;
    };

    private buildErrorResult = (error: any, functionName: string) => {
        const errorTyped = error as RestApiFetchError;
        if (errorTyped.errorType === RestApiFetchErrorType.UnexpectedError) {
            throw new Error(`${errorTyped.message} (${functionName})`);
        }
        const status = errorTyped.status;
        const message = errorTyped.message;
        return `Atoll REST API error: ${status} - ${message} (${functionName})`;
    };

    public buildUriFromBaseAndRelative = (baseUri: string, relativeUri: string): string => {
        return `${baseUri}${relativeUri}`;
    };
    public buildFullUri = (relativeUri: string): string => {
        if (!this.canonicalHostBaseUrl) {
            throw new Error("buildFullUri requires canonicalHostBaseUrl to be set first");
        }
        return this.buildUriFromBaseAndRelative(this.canonicalHostBaseUrl, relativeUri);
    };
    /**
     * Authenticate user on the provided Atoll host server.
     * @param hostBaseUrl for example, https://atoll.yourdomain.com/
     * @param username a valid user in Atoll database
     * @param password password for the provided username
     * @returns message if there's an error, otherwise null
     */
    public connect = async (
        hostBaseUrl: string,
        username: string,
        password: string,
        notificationHandler: HostNotificationHandler
    ): Promise<string | null> => {
        const updateCanonicalHostBaseUrl = true;
        return this.commonConnect(
            "connect",
            hostBaseUrl,
            notificationHandler,
            { skipRetryOnAuthFailure: true },
            updateCanonicalHostBaseUrl,
            () => this.lookupRelativeUriFromApiMap("user-auth", "action"),
            () => ({ username, password })
        );
    };
    public connectWithRefreshToken = async (hostBaseUrl: string, notificationHandler: HostNotificationHandler): Promise<string> => {
        const updateCanonicalHostBaseUrl = false;
        return this.commonConnect(
            "connect",
            hostBaseUrl,
            notificationHandler,
            {},
            updateCanonicalHostBaseUrl,
            () => this.lookupRelativeUriFromApiMap("refresh-token", "action"),
            () => ({ refreshToken: this.refreshToken })
        );
    };
    public commonConnect = async (
        connectFunctionName: string,
        hostBaseUrl: string,
        notificationHandler: HostNotificationHandler,
        authOptions: any,
        updateCanonicalHostBaseUrl: boolean,
        getAuthUrl: () => string,
        buildAuthPayload: () => any
    ): Promise<string | null> => {
        if (this.connecting) {
            throw new Error("Another connection is already in progress!");
        }
        const canonicalHostBaseUrl = this.canonicalizeUrl(hostBaseUrl);
        try {
            await this.fetchApiMapAndBuildIndex(canonicalHostBaseUrl);
        } catch (err) {
            return this.buildErrorResult(err, connectFunctionName);
        }
        this.setupTokenRefresher(canonicalHostBaseUrl);
        this.notificationHandler = notificationHandler;

        const authUrl = getAuthUrl();
        const authActionUri = this.buildUriFromBaseAndRelative(canonicalHostBaseUrl, authUrl);
        const authPayload = buildAuthPayload();

        this.connecting = true;
        try {
            const authServerResponse = await restApi.execAction<AuthServerResponse>(authActionUri, authPayload, authOptions);
            this.connecting = false;
            const { authToken, refreshToken } = authServerResponse.data.item;
            restApi.setDefaultHeader("Authorization", `Bearer  ${authToken}`);
            this.refreshToken = refreshToken;
            if (updateCanonicalHostBaseUrl) {
                this.canonicalHostBaseUrl = canonicalHostBaseUrl;
            }
            return null;
        } catch (error) {
            this.connecting = false;
            return this.buildErrorResult(error, connectFunctionName);
        }
    };

    public disconnect = () => {
        if (this.isConnecting()) {
            throw new Error("Unable to disconnect while connection is being established!");
        }
        if (this.isConnected()) {
            this.refreshToken = null;
        }
    };
    public isConnecting = (): boolean => {
        return this.connecting;
    };
    public isConnected = (): boolean => {
        return !!this.refreshToken;
    };
    public fetchProjects = async (): Promise<ProjectResourceItem[]> => {
        const projectsUri = this.lookupUriFromApiMap("projects", "collection");
        const result = await restApi.get<ProjectsServerResponse>(projectsUri);
        return result.data.items;
    };
    private checkValidFullUri = (functionName: string, uri: string) => {
        if (!isValidFullUri(uri)) {
            throw new Error(`Invalid URI ${uri} passed to ${functionName}`);
        }
    };
    public fetchSprintByUri = async (sprintUri: string): Promise<SprintResourceItem | null> => {
        this.checkValidFullUri("fetchSprintByUri", sprintUri);
        try {
            const result = await restApi.get<SprintServerResponse>(sprintUri);
            return result.data.item;
        } catch (err) {
            if (isRestApiFetchError(err)) {
                if (err.status === StatusCodes.NOT_FOUND) {
                    return null;
                }
            }
            throw err;
        }
    };
    public fetchSprintBacklogItemsByUri = async (sprintBacklogItemsUri: string): Promise<SprintBacklogResourceItem[]> => {
        this.checkValidFullUri("fetchSprintBacklogItemsByUri", sprintBacklogItemsUri);
        const result = await restApi.get<SprintBacklogItemsServerResponse>(sprintBacklogItemsUri);
        return result.data.items;
    };
    public findLinkByRel = (links: ApiResourceItemLink[], rel: string): ApiResourceItemLink | null => {
        const matchingLinks = links.filter((link) => link.rel === rel);
        const matchingLinkCount = matchingLinks.length;
        if (matchingLinkCount === 0) {
            return null;
        } else if (matchingLinkCount > 1) {
            throw new Error(`findLinkUrlByRel(links, "${rel}") matched ${matchingLinkCount} - expecting 1!`);
        } else {
            return matchingLinks[0];
        }
    };
    public findLinkUriByRel = (links: ApiResourceItemLink[], rel: string): string | null => {
        const link = this.findLinkByRel(links, rel);
        if (link === null) {
            return null;
        }
        return link.uri;
    };
}
