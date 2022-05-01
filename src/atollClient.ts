// externals
import axios, { AxiosError } from "axios";

// libraries
import type { ApiMapItem, ApiMapServerResponse, AuthServerResponse, ServerErrorResponse } from "@atoll/api-types";

export const LOGIN_RELATIVE_URL = "/api/v1/actions/login";
export const MAP_RELATIVE_URL = "/api/v1";

export class AtollClient {
    private authToken: string | null;
    private refreshToken: string | null;
    private apiMap: { [key: string]: ApiMapItem } | null;
    constructor() {
        this.authToken = null;
        this.refreshToken = null;
        this.apiMap = null;
    }
    private async getApiMap(hostBaseUrl: string): Promise<ApiMapItem[]> {
        const mapResponse = await axios.get(`${hostBaseUrl}${MAP_RELATIVE_URL}`, {
            headers: {
                "Cache-Control": "no-cache",
                "Context-Type": "application/json",
                Accept: "application/json"
            }
        });
        const axiosData = mapResponse.data as ApiMapServerResponse;
        return axiosData.data.items;
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

    /**
     * Authenticate user on the provided Atoll host server.
     * @param hostBaseUrl for example, https://atoll.yourdomain.com/
     * @param username a valid user in Atoll database
     * @param password password for the provided username
     * @returns message if there's an error, otherwise null
     */
    public async connect(hostBaseUrl: string, username: string, password: string): Promise<string | null> {
        const canonicalHostBaseUrl = this.canonicalizeUrl(hostBaseUrl);
        await this.buildApiMapIndex(canonicalHostBaseUrl);
        const authUrl = this.lookupUriFromApiMap("user-auth", "action");
        try {
            const loginResponse = await axios.post(
                `${canonicalHostBaseUrl}${authUrl}`,
                {
                    username,
                    password
                },
                {
                    headers: {
                        "Context-Type": "application/json",
                        Accept: "application/json"
                    }
                }
            );
            const axiosResponseData = loginResponse.data as AuthServerResponse;
            this.authToken = axiosResponseData.data.item.authToken;
            this.refreshToken = axiosResponseData.data.item.refreshToken;
            return null;
        } catch (error) {
            const errorTyped = error as AxiosError;
            if (!errorTyped) {
                throw new Error("Unexpected condition in 'connect'- error is undefined");
            }
            const errorResponse = errorTyped.response;
            if (!errorResponse) {
                throw new Error(`Unexpected condition in 'connect'- error is "${error}"`);
            }
            const responseData = errorResponse.data as ServerErrorResponse;
            if (!responseData) {
                throw new Error(`Unexpected condition in 'connect'- error.response.data is undefined`);
            }
            const status = responseData.status;
            const message = responseData.message;
            if (!status && !message) {
                if (typeof responseData === "string") {
                    // not what we expected, but roll with it... maybe this is a legacy
                    // API call result or maybe auto-generated because of an unhandled error?
                    return errorResponse.data as string;
                } else {
                    try {
                        const stringifiedErrorObj = JSON.stringify(error);
                        return `Atoll REST API error: ${stringifiedErrorObj}`;
                    } catch (error) {
                        return "Unexpected coniditon in 'connect'- error is not simple object";
                    }
                }
            }
            return `Atoll REST API error: ${status} - ${message}`;
        }
    }
}
