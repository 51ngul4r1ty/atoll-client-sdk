export const isValidFullUri = (candidateFullUri: string) => {
    let url: URL;

    try {
        url = new URL(candidateFullUri);
    } catch (err) {
        return false;
    }

    const validScheme = url.protocol === "http:" || url.protocol === "https:";
    return validScheme;
};
