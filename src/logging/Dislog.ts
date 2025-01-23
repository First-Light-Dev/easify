import axios from "axios";

class Dislog {
    private static instance : Dislog;
    private static isInit = false;
    webhook : string;
    userID : string;


    static initialize(webhook: string, userID: string) {
        if (this.isInit) {
            return this.instance;
        }

        this.instance = new Dislog(webhook, userID);
        this.isInit = true;
        return this.instance;
    }


    static getInstance() {
        if (this.isInit) {
            return this.instance;
        }

        throw new Error('Dislog not initialized. Call initialize() first.');
    }

    
    private constructor(webhook: string, userID: string) {
        this.webhook = webhook;
        this.userID = userID;
    }

    async log(message: string) {
        try {
            await axios.post(this.webhook, {
                content: message
            })
        } catch (error) {
            console.error("Error sending log to Discord", error);
        }
    }

    async alert(message : string) {
        try {
            await axios.post(this.webhook, {
                content: `<@${this.userID}> \n ${message}`
            })
        } catch (error) {
            console.error("Error sending alert to Discord", error);
        }
    }
}


export default Dislog;