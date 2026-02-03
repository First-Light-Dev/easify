import { AxiosInstance } from "axios";
import Cin7 from "..";
import { CREDIT_NOTES } from "../puppeteer/constants";
import { CreditNote, CreditNoteStockReceipt } from "./types/CreditNotes";
import { APIUpsertResponse } from "./types";
import { formatDateToTimezone } from "../../utils/timezone";

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

    async updateBatch(creditNotes: (Partial<CreditNote> & { id: number })[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.put(`/CreditNotes`, creditNotes);
        return response.data as Array<APIUpsertResponse>;
    }

    async createStockReceipts(stockReceipts: CreditNoteStockReceipt[]): Promise<Array<{ success: boolean, error: string, creditNoteId: string }>> {
        let returnValues: Array<{ success: boolean, error: string, creditNoteId: string }> = [];

        let [CNR, nonCNR] = stockReceipts.reduce((acc, receipt) => {
            if (receipt.lines.some(line => line.returnQty !== line.restockQty)) {
                acc[0].push(receipt);
            } else {
                acc[1].push(receipt);
            }
            return acc;
        }, [[], []] as CreditNoteStockReceipt[][]);

        if (nonCNR.length > 0) {
            const creditNoteUpdatePayloads: (Partial<CreditNote> & { id: number })[] = [];
            for (const receipt of nonCNR) {
                const completedDate = receipt.closedAt ? new Date(receipt.closedAt).toISOString() : new Date().toISOString();
                const createdDate = receipt.approvedAt ? new Date(receipt.approvedAt).toISOString() : undefined;
                creditNoteUpdatePayloads.push({ id: parseInt(receipt.id), ...(createdDate ? { createdDate : createdDate } : {}), completedDate: completedDate, creditNoteDate: completedDate, isApproved: true });
            }
            await this.updateBatch(creditNoteUpdatePayloads).then(responses => {
                returnValues.push(...responses.map((r, idx) => ({ success: r.success, error: r.errors.join(', '), creditNoteId: `${nonCNR[idx].id}` })));
            });
        }

        if (CNR.length > 0) {
            let page = await this.cin7.getPuppeteerPage();
            console.log("Creating stock receipts");
            for (const stockReceipt of CNR) {
                try {
                    console.log("Creating stock receipt", stockReceipt.id);
                    try {
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 });
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

                    console.log("Navigated to credit note");
                    const lineItemsTableData: { sku: string, nthChild: number, barcode: string }[] = await page.evaluate((skuFieldsSelector, internalCommentsFieldsSelector) => {
                        const skuFields = document.querySelectorAll(skuFieldsSelector);
                        const internalCommentsFields = document.querySelectorAll(internalCommentsFieldsSelector);
                        return Array.from(skuFields).map((skuField, index) => ({
                            sku: skuField.innerHTML?.trim() ?? "",
                            nthChild: index + 2,
                            barcode: (internalCommentsFields[index]?.innerHTML?.trim() ?? "").includes("Barcode:") ? internalCommentsFields[index]?.innerHTML?.trim().split("Barcode:")[1]?.trim() ?? "" : "",
                        })).filter(data => data.sku !== "" && !data.sku.includes("<i>Search...</i>"));
                    }, CREDIT_NOTES.selectors.skuFields, CREDIT_NOTES.selectors.internalCommentsFields);

                    console.log("Line items table data", JSON.stringify(lineItemsTableData));

                    // No need to do branch change
                    // await page.waitForSelector(CREDIT_NOTES.selectors.branchOptionOpenDialogButton, { visible: true });
                    // await page.click(CREDIT_NOTES.selectors.branchOptionOpenDialogButton);
                    // await new Promise(resolve => setTimeout(resolve, 3000));

                    // const branchElements = await page.$$(CREDIT_NOTES.selectors.branchOptions);
                    // for (const element of branchElements) {
                    //     const onclickAttr = await element.evaluate(el => el.getAttribute('onclick'));
                    //     const branchName = stockReceipt.branchName;
                    //     if (onclickAttr?.split("'").includes(branchName)) {
                    //         await element.click();
                    //         break;
                    //     }
                    // }
                    // await new Promise(resolve => setTimeout(resolve, 3000));

                    const completedDateIsoString = stockReceipt.closedAt ? stockReceipt.closedAt : new Date().toISOString();
                    const completedDate = formatDateToTimezone(completedDateIsoString, stockReceipt.timezone, "date");
                    const completedTime = formatDateToTimezone(completedDateIsoString, stockReceipt.timezone, "time");

                    await page.type(CREDIT_NOTES.selectors.completedDateField, completedDate);
                    await page.type(CREDIT_NOTES.selectors.completedTimeField, completedTime);
                    await page.type(CREDIT_NOTES.selectors.creditNoteDateField, completedDate);
                    await page.type(CREDIT_NOTES.selectors.creditNoteTimeField, completedTime);

                    for (const lineItem of lineItemsTableData) {
                        await page.click(CREDIT_NOTES.selectors.getQtyMovedField(lineItem.nthChild));
                        console.log("Clicked qty moved field", lineItem.nthChild);
                        await page.waitForSelector(CREDIT_NOTES.selectors.actualQtyMovedField, { timeout: 5000 });
                        console.log("Waited for actual qty moved field");
                        await page.evaluate(selector => {
                            const input = document.querySelector(selector) as HTMLInputElement;
                            if (input) input.value = '';
                        }, CREDIT_NOTES.selectors.actualQtyMovedField);

                        // get value from this field CREDIT_NOTES.selectors.batchNumberField
                        const batchNumber = await page.evaluate(selector => {
                            const input = document.querySelector(selector) as HTMLInputElement;
                            if (input.readOnly) return "FIFO";
                            input.value = "";
                            return input?.value ?? "";
                        }, CREDIT_NOTES.selectors.batchNumberField);

                        const matchingStockReceiptLine = stockReceipt.lines.find(line => {
                            if (lineItem.barcode && lineItem.barcode.toLowerCase() === line.barcode.toLowerCase()) return true;
                            if (line.sku.toLowerCase().startsWith(lineItem.sku.toLowerCase())) return true;
                            return false;
                        });

                        await page.type(CREDIT_NOTES.selectors.actualQtyMovedField, `${-1 * Math.abs(matchingStockReceiptLine?.restockQty ?? 0)}`);

                        if (batchNumber !== "FIFO") {
                            await page.type(CREDIT_NOTES.selectors.batchNumberField, matchingStockReceiptLine?.batch ?? "");
                        }

                        await page.click(CREDIT_NOTES.selectors.saveIntakeButton);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

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
                    returnValues.push({
                        success: true,
                        error: "",
                        creditNoteId: `${stockReceipt.id}`
                    });

                } catch (error) {
                    console.error(`Error creating stock receipt for credit note ${stockReceipt}:`, error);
                    returnValues.push({
                        success: false,
                        error: error instanceof Error ? error.message : `Error: ${error}`,
                        creditNoteId: `${stockReceipt.id}`
                    });
                    await this.cin7.closeBrowser();
                    page = await this.cin7.getPuppeteerPage();
                }
            }
            await this.cin7.closeBrowser();
        }
        // sort returnValues in the input order
        returnValues = returnValues.sort((a, b) => {
            const indexA = stockReceipts.findIndex(receipt => receipt.id === a.creditNoteId);
            const indexB = stockReceipts.findIndex(receipt => receipt.id === b.creditNoteId);
            return indexA - indexB;
        });
        return returnValues;
    }

    async voidCreditNotes(creditNoteIds: string[]): Promise<Array<{ success: boolean, error: string }>> {

        let returnValues: Array<{ success: boolean, error: string }> = [];
        let page = await this.cin7.getPuppeteerPage();
        for (const creditNoteId of creditNoteIds) {
            try {
                this.cin7.ensureDialogHandler(page);

                try {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 });
                } catch (error) {
                    if (error instanceof Error && error.name === 'TimeoutError') {
                        console.warn('Navigation timeout - continuing with execution');
                        // Optionally add a small delay to ensure page is in a stable state
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        throw error; // Re-throw if it's not a timeout error
                    }
                }

                console.log("Voiding credit note", creditNoteId, CREDIT_NOTES.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.creditNotes ?? "", creditNoteId));
                
                await page.goto(CREDIT_NOTES.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.creditNotes ?? "", creditNoteId), { waitUntil: 'domcontentloaded' });

                await page.waitForSelector(CREDIT_NOTES.selectors.adminButton, { timeout: 5000 });

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

    // getInternalCommentsData<T extends Record<string, string>>(creditNote: CreditNote, separator: string = '#--#'): T {
    //     const splitComments = creditNote.internalComments.split(separator);
    //     const result: T = {} as T;
    //     splitComments.forEach(comment => {
    //         if (comment.includes('##')) {
    //             comment = comment.split('##')[1];
    //         }
    //         if (comment.includes(': ')) {
    //             const [key, value] = comment.split(': ');
    //             result[key as keyof T] = value as T[keyof T];
    //         }
    //     });
    //     return result;
    // }

    getInternalCommentsData<T extends Record<string, string>>(creditNote: CreditNote, separator: string = '#--#'): T {
        const result: T = {} as T;
        
        // Extract content between #FL# tags
        const matches = creditNote.internalComments.match(/##(.*?)##/);
        if (!matches || !matches[1]) return result;
        
        // Split the extracted content by separator
        const splitComments = matches[1].split(separator);
        
        splitComments.forEach(comment => {
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

    async updateDatesToCreditNote(creditNotes: { id: string, createdDate: string, completedDate: string, creditNoteDate: string, timezone: string}[]): Promise<Array<{ id: string, success: boolean, error: string }>> {
        const page = await this.cin7.getPuppeteerPage();

        const returnValues: Array<{ id: string, success: boolean, error: string }> = [];

        try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 });
        } catch (error) {
            if (error instanceof Error && error.name === 'TimeoutError') {
                console.warn('Navigation timeout - continuing with execution');
                // Optionally add a small delay to ensure page is in a stable state
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                throw error; // Re-throw if it's not a timeout error
            }
        }

        for (const creditNote of creditNotes) {
            console.log("Updating dates to credit note", creditNote.id);
            await page.goto(CREDIT_NOTES.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.creditNotes ?? "", creditNote.id), { waitUntil: 'domcontentloaded' });

            await page.waitForFunction(() => {
                return document.readyState === 'complete';
                // Keeps polling until readyState is 'complete' or timeout occurs
            }, { timeout: 10000 });

            await page.waitForSelector(CREDIT_NOTES.selectors.completedDateField, { timeout: 5000 });
            
            const completedDate = formatDateToTimezone(creditNote.completedDate, creditNote.timezone, "date");
            const completedTime = formatDateToTimezone(creditNote.completedDate, creditNote.timezone, "time");

            const createdDate = formatDateToTimezone(creditNote.createdDate, creditNote.timezone, "date");
            const createdTime = formatDateToTimezone(creditNote.createdDate, creditNote.timezone, "time");

            // Helper function to clear and type into a field
            const clearAndType = async (selector: string, value: string) => {
                await page.click(selector, { clickCount: 3 }); // Triple-click to select all
                await page.keyboard.press('Backspace'); // Clear selected content
                await page.type(selector, value);
            };

            await clearAndType(CREDIT_NOTES.selectors.createdDateField, createdDate);
            await clearAndType(CREDIT_NOTES.selectors.createdTimeField, createdTime);
            await clearAndType(CREDIT_NOTES.selectors.completedDateField, completedDate);
            await clearAndType(CREDIT_NOTES.selectors.completedTimeField, completedTime);
            await clearAndType(CREDIT_NOTES.selectors.creditNoteDateField, completedDate);
            await clearAndType(CREDIT_NOTES.selectors.creditNoteTimeField, completedTime);

            // Check if both firstNameField and companyNameField are empty
            const firstNameValue = await page.evaluate((selector) => {
                const el = document.querySelector(selector) as HTMLInputElement;
                const value = el ? el.value.trim() : '';
                // Treat "Search..." placeholder as empty
                return value === 'Search...' ? '' : value;
            }, CREDIT_NOTES.selectors.firstNameField);
            
            const companyNameValue = await page.evaluate((selector) => {
                const el = document.querySelector(selector) as HTMLInputElement;
                const value = el ? el.value.trim() : '';
                // Treat "Search..." placeholder as empty
                return value === 'Search...' ? '' : value;
            }, CREDIT_NOTES.selectors.companyNameField);
            
            if (!firstNameValue && !companyNameValue) {
                // Ask team tomorrow on how to handle these
                // await clearAndType(CREDIT_NOTES.selectors.firstNameField, "N/A");
            }
            
            // Wait a bit for form to update after typing
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
                if(!firstNameValue && !companyNameValue) {
                    returnValues.push({
                        id: creditNote.id,
                        success: false,
                        error: "Both firstName and companyName are empty",
                    });
                    continue;
                }
                // Wait for the button to be visible and enabled
                await page.waitForSelector(CREDIT_NOTES.selectors.saveToAdminButton, { visible: true, timeout: 5000 });
                
                // Scroll button into view
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, CREDIT_NOTES.selectors.saveToAdminButton);
                
                // Wait a bit after scrolling
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Click and wait for navigation
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6000 }),
                    page.click(CREDIT_NOTES.selectors.saveToAdminButton)
                ]);
                returnValues.push({
                    id: creditNote.id,
                    success: true,
                    error: "",
                });
            } catch (error) {
                console.error(`Error updating dates to credit note ${creditNote.id}:`, error);
                returnValues.push({
                    id: creditNote.id,
                    success: false,
                    error: error instanceof Error ? error.message : `Error: ${error}`,
                });
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        await this.cin7.closeBrowser();
        return returnValues;
    }

}