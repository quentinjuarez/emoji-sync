export {};

declare global {
  type Emoji = {
    id: string;
    url: string;
    name: string;
  };

  interface Integration {
    id: string;
    type: string;
    status: string;
    name: string;
    accessToken?: string;
  }
}
