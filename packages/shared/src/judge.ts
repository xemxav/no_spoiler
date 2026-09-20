export interface Tweet {
  id: string;
  author: string;
  text: string;
}

export interface JudgeRequest {
  watchlist: string[];
  tweets: Tweet[];
}

export interface JudgeResponse {
  results: Record<string, boolean>;
}
