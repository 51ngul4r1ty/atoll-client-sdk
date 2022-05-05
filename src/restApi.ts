// libraries
import type { ServerDataResponse, ServerErrorResponse } from "@atoll/api-types";
import { RequestApiFetchCacheOption, RequestApiFetchFormatOption, RestApiFetch } from "@atoll/rest-fetch";

export const restApi = new RestApiFetch<ServerDataResponse<any>, ServerErrorResponse>({
    cache: RequestApiFetchCacheOption.NoCache,
    format: RequestApiFetchFormatOption.Json
});
