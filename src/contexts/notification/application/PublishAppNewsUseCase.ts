import { IAppNewsRepository } from '../ports/IAppNewsRepository';
import { IPushService } from '../ports/IPushService';
import { AppNews, PublishAppNewsInput } from '../domain/AppNews';
import { logger } from '../../../shared/logger';

export class PublishAppNewsUseCase {
  constructor(
    private readonly repo: IAppNewsRepository,
    private readonly push: IPushService,
  ) {}

  /** 앱 소식 저장 + 수신 켠 모든 디바이스에 FCM 발송 (푸시 실패는 무시) */
  async execute(input: PublishAppNewsInput): Promise<{ news: AppNews; pushed: number }> {
    const news = await this.repo.publishAppNews(input);

    const tokens = await this.repo.listAppNewsTokens();
    if (tokens.length) {
      try {
        await this.push.sendBatch(tokens, {
          title: news.title,
          body: news.body,
          data: { type: 'app_news', newsId: news.id, ...(news.link ? { link: news.link } : {}) },
        });
      } catch (err) {
        logger.warn({ err, newsId: news.id }, 'app_news push failed (news saved)');
      }
    }
    return { news, pushed: tokens.length };
  }

  async remove(id: string): Promise<void> {
    await this.repo.deleteAppNews(id);
  }
}
