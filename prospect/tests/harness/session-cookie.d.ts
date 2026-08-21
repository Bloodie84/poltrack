export declare function buildAuthCookie(options: {
  url: string;
  userId: string;
  email: string;
  accessToken?: string;
}): { name: string; value: string };
