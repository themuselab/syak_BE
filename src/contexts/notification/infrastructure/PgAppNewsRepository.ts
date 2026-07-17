import { Pool } from 'pg';
import { IAppNewsRepository } from '../ports/IAppNewsRepository';
import { AppNews, PublishAppNewsInput, RegisterDeviceInput } from '../domain/AppNews';

export class PgAppNewsRepository implements IAppNewsRepository {
  constructor(private readonly pool: Pool) {}

  async upsertDevice(input: RegisterDeviceInput): Promise<void> {
    // device_id 기준 upsert. 같은 fcm_token이 다른 device_id로 오면(재설치 등)
    // uq_push_devices_token 충돌 → 옛 device row를 지우고 새로 넣는다.
    await this.pool.query('DELETE FROM push_devices WHERE fcm_token = $1 AND device_id <> $2',
      [input.fcmToken, input.deviceId]);
    await this.pool.query(
      `INSERT INTO push_devices (device_id, fcm_token, platform, app_news_enabled, user_id, updated_at)
       VALUES ($1, $2, $3, COALESCE($4, true), $5, NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         fcm_token        = EXCLUDED.fcm_token,
         platform         = COALESCE(EXCLUDED.platform, push_devices.platform),
         app_news_enabled = COALESCE($4, push_devices.app_news_enabled),
         user_id          = COALESCE(EXCLUDED.user_id, push_devices.user_id),
         updated_at       = NOW()`,
      [
        input.deviceId,
        input.fcmToken,
        input.platform ?? null,
        input.appNewsEnabled ?? null,
        input.userId ?? null,
      ],
    );
  }

  async listAppNews(limit: number): Promise<AppNews[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM app_news ORDER BY published_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(this.map);
  }

  async publishAppNews(input: PublishAppNewsInput): Promise<AppNews> {
    const { rows } = await this.pool.query(
      `INSERT INTO app_news (title, body, link, image_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.title, input.body, input.link ?? null, input.imageUrl ?? null],
    );
    return this.map(rows[0]);
  }

  async deleteAppNews(id: string): Promise<void> {
    await this.pool.query('DELETE FROM app_news WHERE id = $1', [id]);
  }

  async listAppNewsTokens(): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT fcm_token FROM push_devices WHERE app_news_enabled = true AND fcm_token IS NOT NULL`,
    );
    return rows.map((r) => r.fcm_token as string);
  }

  private map(row: Record<string, unknown>): AppNews {
    return {
      id: row.id as string,
      title: row.title as string,
      body: row.body as string,
      link: (row.link as string) ?? null,
      imageUrl: (row.image_url as string) ?? null,
      publishedAt: row.published_at as Date,
    };
  }
}
