import { AxiosInstance } from "axios";
import Cin7 from "..";
import { CREDIT_NOTES } from "../puppeteer/constants";
import { CreditNote, CreditNoteStockReceipt } from "./types/CreditNotes";
import { APIUpsertResponse } from "./types";

export default class CreditNotes {
    constructor(private axios: AxiosInstance, private cin7: Cin7) { }

    async get(id: string): Promise<CreditNote | undefined> {
        const response = await this.axios.get(`/CreditNotes/${id}`);
        return response.data;
    }

    async getByOrderRefs(refs: string[]): Promise<CreditNote[]> {
        const _refs = refs.map(ref => ref.replace(/#/g, "%23"));
        const response = await this.axios.get(`/CreditNotes?where=${_refs.map(ref => `SalesReference='${ref}'`).join(' OR ')}`);
        return response.data as CreditNote[];
    }

    async getByIds(ids: string[]): Promise<CreditNote[]> {
        const response = await this.axios.get(`/CreditNotes?where=${ids.map(id => `Id=${id}`).join(' OR ')}`);
        return response.data as CreditNote[];
    }

    async search(query: string): Promise<CreditNote[]> {
        const response = await this.axios.get(`/CreditNotes?where=${query}`);
        return response.data as CreditNote[];
    }

    async create(creditNote: Partial<CreditNote>): Promise<string> {
        console.log("Creating Credit Note", JSON.stringify(creditNote));
        const response = await this.axios.post(`/CreditNotes`, [creditNote]);

        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async createBatch(creditNotes: Partial<CreditNote>[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.post(`/CreditNotes`, creditNotes);
        return response.data as Array<APIUpsertResponse>;
    }

    async update(creditNote: (Partial<CreditNote> & { id: number })): Promise<string> {
        console.log("Updating Credit Note", JSON.stringify(creditNote));
        const response = await this.axios.put(`/CreditNotes`, [creditNote]);
        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async updateBatch(creditNotes: (Partial<CreditNote>)[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.put(`/CreditNotes`, creditNotes);
        return response.data as Array<APIUpsertResponse>;
    }

    async createStockReceipts(stockReceipts: CreditNoteStockReceipt[]): Promise<Array<{ success: boolean, error: string }>> {
        let returnValues: Array<{ success: boolean, error: string }> = [];
        let page = await this.cin7.getPuppeteerPage();
        console.log("Creating stock receipts");
        for (const stockReceipt of stockReceipts) {
            try {
                console.log("Creating stock receipt", stockReceipt.id);
                try {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
                } catch (error) {
                    if (error instanceof Error && error.name === 'TimeoutError') {
                        console.warn('Navigation timeout - continuing with execution');
                        // Optionally add a small delay to ensure page is in a stable state
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        throw error; // Re-throw if it's not a timeout error
                    }
                }
                await page.goto(CREDIT_NOTES.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.creditNotes ?? "", stockReceipt.id), { waitUntil: 'domcontentloaded' });
                // await page.waitForNavigation({ waitUntil: 'networkidle0' });

                page.on('dialog', async dialog => {
                    console.log(`Dialog message: ${dialog.message()}`);
                    await dialog.accept();
                });
                
                console.log("Navigated to credit note");
                const lineItemsTableData : {sku: string, nthChild: number}[] = await page.evaluate((selector) => {
                    const skuFields = document.querySelectorAll(selector);
                    return Array.from(skuFields).map((skuField, index) => ({
                        sku: skuField.innerHTML?.trim() ?? "",
                        nthChild: index + 2,
                    })).filter(data => data.sku !== "" && !data.sku.includes("<i>Search...</i>"));
                }, CREDIT_NOTES.selectors.skuFields);

                console.log("Line items table data", JSON.stringify(lineItemsTableData));

                await page.waitForSelector(CREDIT_NOTES.selectors.branchOptionOpenDialogButton, { visible: true });
                await page.click(CREDIT_NOTES.selectors.branchOptionOpenDialogButton);
                await new Promise(resolve => setTimeout(resolve, 3000));
        
                const branchElements = await page.$$(CREDIT_NOTES.selectors.branchOptions);
                for (const element of branchElements) {
                    const onclickAttr = await element.evaluate(el => el.getAttribute('onclick'));
                    const branchName = stockReceipt.branchName;
                    if (onclickAttr?.split("'").includes(branchName)) {
                        await element.click();
                        break;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 3000));

                for (const lineItem of lineItemsTableData) {
                    await page.click(CREDIT_NOTES.selectors.getQtyMovedField(lineItem.nthChild));
                    console.log("Clicked qty moved field", lineItem.nthChild);
                    await page.waitForSelector(CREDIT_NOTES.selectors.actualQtyMovedField, { timeout: 5000 });
                    console.log("Waited for actual qty moved field");
                    await page.evaluate(selector => {
                        const input = document.querySelector(selector) as HTMLInputElement;
                        if (input) input.value = '';
                    }, CREDIT_NOTES.selectors.actualQtyMovedField);                    

                    await page.evaluate(selector => {
                        const input = document.querySelector(selector) as HTMLInputElement;
                        if (input) input.value = '';
                    }, CREDIT_NOTES.selectors.batchNumberField);

                    // get value from this field CREDIT_NOTES.selectors.batchNumberField
                    const batchNumber = await page.evaluate(selector => {
                        const input = document.querySelector(selector) as HTMLInputElement;
                        return input?.value ?? "";
                    }, CREDIT_NOTES.selectors.batchNumberField);

                    await page.type(CREDIT_NOTES.selectors.actualQtyMovedField, `${-1 * Math.abs(stockReceipt.lines.find(line => line.sku === lineItem.sku)?.qty ?? 0)}`);

                    await new Promise(resolve => setTimeout(resolve, 5000));

                    if (batchNumber !== "FIFO") {
                        await page.type(CREDIT_NOTES.selectors.batchNumberField, stockReceipt.lines.find(line => line.sku === lineItem.sku)?.batch ?? "");
                    }

                    await page.click(CREDIT_NOTES.selectors.saveIntakeButton);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                const currentDate = new Date();
                const formattedDate = currentDate.toLocaleDateString('en-GB').replace(/\//g, '-'); // Format: DD-MM-YYYY
                const formattedTime = currentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // Format: HH:MM AM/PM

                await page.type(CREDIT_NOTES.selectors.completedDateField, formattedDate);
                await page.type(CREDIT_NOTES.selectors.completedTimeField, formattedTime);

                try {
                    await page.waitForSelector(CREDIT_NOTES.selectors.approveButton, { timeout: 4000 });
                    await Promise.all([
                        page.click(CREDIT_NOTES.selectors.approveButton),
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                    ]);
                } catch (error) {
                    await Promise.all([
                        page.click(CREDIT_NOTES.selectors.saveButton),
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                    ]);
                }

            } catch (error) {
                console.error(`Error creating stock receipt for credit note ${stockReceipt}:`, error);
                returnValues.push({
                    success: false,
                    error: error instanceof Error ? error.message : `Error: ${error}`,
                });
                await this.cin7.closeBrowser();
                page = await this.cin7.getPuppeteerPage();
            }
        }
        returnValues.push({
            success: true,
            error: "",
        });
        await this.cin7.closeBrowser();
        return returnValues;
    }

    async voidCreditNotes(creditNoteIds: string[]): Promise<Array<{ success: boolean, error: string }>> {
        
        let returnValues: Array<{ success: boolean, error: string }> = [];
        let page = await this.cin7.getPuppeteerPage();
        for (const creditNoteId of creditNoteIds) {
            try {
                console.log("Voiding credit note", creditNoteId, CREDIT_NOTES.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.creditNotes ?? "", creditNoteId));
                await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
                await page.goto(CREDIT_NOTES.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.creditNotes ?? "", creditNoteId), { waitUntil: 'domcontentloaded' });

                await page.waitForSelector(CREDIT_NOTES.selectors.adminButton, { timeout: 5000 });
                
                page.on('dialog', async dialog => {
                    console.log(`Dialog message: ${dialog.message()}`);
                    await dialog.accept();
                });

                const [response] = await Promise.all([
                    page.waitForNavigation(),
                    page.click(CREDIT_NOTES.selectors.adminButton)
                ]);

                if (!response) {
                    throw new Error("Failed to go to admin page");
                }

                await page.waitForSelector(CREDIT_NOTES.selectors.voidButton, { timeout: 5000 });

                const [voidResponse] = await Promise.all([
                    page.waitForNavigation(),
                    page.click(CREDIT_NOTES.selectors.voidButton)
                ]);

                if (!voidResponse) {
                    throw new Error("Failed to void credit note");
                }

                returnValues.push({
                    success: true,
                    error: "",
                });
            } catch (error) {
                console.error(`Error voiding credit note ${creditNoteId}:`, error);
                returnValues.push({
                    success: false,
                    error: error instanceof Error ? error.message : `Error: ${error}`,
                });
                await page.close();
                page = await this.cin7.getPuppeteerPage();
            }
        }
        await this.cin7.closeBrowser();
        return returnValues;
    }

    getInternalCommentsData<T extends Record<string, string>>(creditNote: CreditNote, separator: string = '#--#'): T {
        const splitComments = creditNote.internalComments.split(separator);
        const result: T = {} as T;
        splitComments.forEach(comment => {
            if(comment.includes('##')) {
                comment = comment.split('##')[1];
            }
            if(comment.includes(': ')) {
                const [key, value] = comment.split(': ');
                result[key as keyof T] = value as T[keyof T];
            }
        });
        return result;
    }

    getInternalCommentStr<T extends Record<string, string>>(data: T, separator: string = '#--#'): string {
        return `##${Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(separator)}##`;
    }

}