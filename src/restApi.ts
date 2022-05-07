// libraries
import type { AuthServerResponse, ServerDataResponse, ServerErrorResponse } from "@atoll/api-types";
import { RequestApiFetchCacheOption, RequestApiFetchFormatOption, RestApiFetch } from "@atoll/rest-fetch";

let currentRefreshToken: string;

export const restApi = new RestApiFetch<ServerDataResponse<any>, ServerErrorResponse>({
    cache: RequestApiFetchCacheOption.NoCache,
    format: RequestApiFetchFormatOption.Json
});

export const updateRefreshToken = (updatedRefreshToken: string) => {
    currentRefreshToken = updatedRefreshToken;
};

export const setupAuthFailureHandler = (
    refreshTokenUri: string,
    handleAuthFailureNotification: { (refreshTokenUri: string): Promise<void> },
    handleRefreshTokenSuccessNotification: { (newAuthToken, newRefreshToken: string): Promise<void> },
    handleRefreshTokenFailureNotification: { (oldRefreshToken: string): Promise<void> }
) => {
    restApi.onAuthFailure = async () => {
        await handleAuthFailureNotification(refreshTokenUri);
        try {
            const result = await restApi.execAction<AuthServerResponse>(
                refreshTokenUri,
                { refreshToken: currentRefreshToken },
                { skipRetryOnAuthFailure: true }
            );
            const { authToken, refreshToken } = result.data.item;
            updateRefreshToken(refreshToken);
            restApi.setDefaultHeader("Authorization", `Bearer  ${authToken}`);
            await handleRefreshTokenSuccessNotification(authToken, refreshToken);
            return true;
        } catch (error) {
            await handleRefreshTokenFailureNotification(currentRefreshToken);
            return false;
        }
    };
};
