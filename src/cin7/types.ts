export interface APIUpsertResponse {
    index: number;
    success: boolean;
    id: number;
    code: string | null;
    errors: string[];
  } 
  