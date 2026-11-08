import { Pool } from 'pg';
import { IReviewAccountRepository } from '../ports/IReviewAccountRepository';

export class PgReviewAccountRepository implements IReviewAccountRepository {
  constructor(private readonly pool: Pool) {}

  async consumeAttempt(clientKey: string): Promise<boolean> {
    await this.pool.query("DELETE FROM review_login_attempts WHERE window_start < NOW() - INTERVAL '1 day'");
    const { rows } = await this.pool.query(
      `INSERT INTO review_login_attempts (client_key, attempts) VALUES ($1, 1)
       ON CONFLICT (client_key) DO UPDATE SET
         attempts = CASE WHEN review_login_attempts.window_start < NOW() - INTERVAL '15 minutes'
                         THEN 1 ELSE review_login_attempts.attempts + 1 END,
         window_start = CASE WHEN review_login_attempts.window_start < NOW() - INTERVAL '15 minutes'
                             THEN NOW() ELSE review_login_attempts.window_start END
       RETURNING attempts`, [clientKey],
    );
    return rows[0].attempts <= 10;
  }

  async findAccount(username: string) {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.nickname, u.profile_image, u.created_at, u.status,
              a.password_hash, a.enabled
       FROM review_accounts a JOIN users u ON u.id = a.user_id WHERE a.username = $1`, [username],
    );
    const r = rows[0];
    return r ? {
      user: { id: r.id as string, nickname: r.nickname as string | null,
        profileImage: r.profile_image as string | null, createdAt: r.created_at as Date,
        status: r.status as 'active' | 'banned' },
      passwordHash: r.password_hash as string, enabled: r.enabled as boolean,
    } : null;
  }
}
