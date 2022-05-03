// libraries
import type { ServerDataResponse, ServerErrorResponse } from "@atoll/api-types";
import { CacheOption, FormatOption, RestApiFetch } from "@atoll/rest-fetch";

export const restApi = new RestApiFetch<ServerDataResponse<any>, ServerErrorResponse>({
    cache: CacheOption.NoCache,
    format: FormatOption.Json
});
