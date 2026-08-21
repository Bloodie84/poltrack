export declare function startSupabaseStub(options: {
  databaseUrl: string;
  userId: string;
  email: string;
  port: number;
}): Promise<{ url: string; close: () => Promise<void> }>;
