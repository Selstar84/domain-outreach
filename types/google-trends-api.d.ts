declare module 'google-trends-api' {
  interface TrendsOptions {
    keyword: string | string[]
    startTime?: Date
    endTime?: Date
    geo?: string
    hl?: string
    timezone?: number
    category?: number
    granularTime?: string
  }

  function interestOverTime(options: TrendsOptions): Promise<string>
  function relatedTopics(options: TrendsOptions): Promise<string>
  function relatedQueries(options: TrendsOptions): Promise<string>

  const googleTrends: {
    interestOverTime: typeof interestOverTime
    relatedTopics: typeof relatedTopics
    relatedQueries: typeof relatedQueries
  }

  export = googleTrends
}
