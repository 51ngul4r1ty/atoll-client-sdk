export type DebugLogItem = {
    message: string;
};

export type DebugLog = {
    items: DebugLogItem[];
    errorResult: string | null;
};
