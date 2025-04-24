declare class Dislog {
    private static instance;
    private static isInit;
    webhook: string;
    userID: string;
    static initialize(webhook: string, userID: string): Dislog;
    static getInstance(): Dislog;
    private constructor();
    log(message: string): Promise<void>;
    alert(message: string): Promise<void>;
}
export default Dislog;
