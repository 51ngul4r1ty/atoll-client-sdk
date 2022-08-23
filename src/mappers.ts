// libraries
import { BacklogItemStatus } from "@atoll/rich-types";

export const backlogItemStatusToString = (backlogItemStatus: BacklogItemStatus): string | null => {
    switch (backlogItemStatus) {
        case BacklogItemStatus.NotStarted: {
            return "N";
        }
        case BacklogItemStatus.InProgress: {
            return "P";
        }
        case BacklogItemStatus.Done: {
            return "D";
        }
        case BacklogItemStatus.Accepted: {
            return "A";
        }
        case BacklogItemStatus.Released: {
            return "R";
        }
        case BacklogItemStatus.None: {
            return null;
        }
        default: {
            throw new Error(`Invalid BacklogItemStatus value ${backlogItemStatus} - unable to map to string`);
        }
    }
};

export const mapBacklogItemToApiStatus = (backlogItemStatus: BacklogItemStatus): string | null => {
    switch (backlogItemStatus) {
        case BacklogItemStatus.NotStarted: {
            return "N";
        }
        case BacklogItemStatus.InProgress: {
            return "P";
        }
        case BacklogItemStatus.Done: {
            return "D";
        }
        case BacklogItemStatus.Accepted: {
            return "A";
        }
        case BacklogItemStatus.Released: {
            return "R";
        }
        case BacklogItemStatus.None: {
            return null;
        }
        default: {
            throw new Error(`Invalid BacklogItemStatus value ${backlogItemStatus} - unable to map to string`);
        }
    }
};

export const mapApiToBacklogItemStatus = (status: string | null): BacklogItemStatus => {
    switch (status) {
        case undefined:
        case null:
        case "N": {
            return BacklogItemStatus.NotStarted;
        }
        case "P": {
            return BacklogItemStatus.InProgress;
        }
        case "D": {
            return BacklogItemStatus.Done;
        }
        case "A": {
            return BacklogItemStatus.Accepted;
        }
        case "R": {
            return BacklogItemStatus.Released;
        }
        default: {
            throw new Error(`Unknown backlog item status "${status}"`);
        }
    }
};
