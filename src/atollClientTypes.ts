export type HostNotificationMessageLevel = "info" | "warn" | "error";

export type HostNotificationHandler = (message: string, level: HostNotificationMessageLevel) => Promise<void>;
