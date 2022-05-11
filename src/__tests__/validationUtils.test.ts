// code under test
import * as validationUtils from "../validationUtils";

describe("Validation Utils", () => {
    it("should validate a localhost URI", () => {
        // arrange
        const candidateFullUri = "http://localhost:8500/";

        // act
        const actual = validationUtils.isValidFullUri(candidateFullUri);

        // assert
        expect(actual).toBe(true);
    });
    it("should validate a localhost URI with https", () => {
        // arrange
        const candidateFullUri = "https://localhost:8500/";

        // act
        const actual = validationUtils.isValidFullUri(candidateFullUri);

        // assert
        expect(actual).toBe(true);
    });
    it("should not validate a localhost URI with 'rest' as a scheme", () => {
        // arrange
        const candidateFullUri = "rest://localhost:8500/";

        // act
        const actual = validationUtils.isValidFullUri(candidateFullUri);

        // assert
        expect(actual).toBe(false);
    });
    it("should not validate a relative URI", () => {
        // arrange
        const candidateFullUri = "/just-some-path-to-a-resource";

        // act
        const actual = validationUtils.isValidFullUri(candidateFullUri);

        // assert
        expect(actual).toBe(false);
    });
});
