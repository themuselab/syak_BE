import { Pool } from 'pg';
import { IUserRepository } from '../ports/IUserRepository';
import { User, SocialProvider, SocialProfile } from '../domain/User';
import { RefreshTokenRecord } from '../domain/AuthToken';

export class PgUserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  async findBySocial(provider: SocialProvider, socialId: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.nickname, u.profile_image, u.created_at
       FROM users u
       JOIN user_social_accounts sa ON sa.user_id = u.id
       WHERE sa.social_provider = $1 AND sa.social_id = $2`,
      [provider, socialId],
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async findUserIdBySocial(provider: SocialProvider, socialId: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      'SELECT user_id FROM user_social_accounts WHERE social_provider = $1 AND social_id = $2',
      [provider, socialId],
    );
    return rows[0]?.user_id ?? null;
  }

  async createUser(profile: SocialProfile): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO users (nickname, profile_image) VALUES ($1, $2) RETURNING *`,
        [profile.nickname, profile.profileImage],
      );
      await client.query(
        `INSERT INTO user_social_accounts (user_id, social_provider, social_id)
         VALUES ($1, $2, $3)`,
        [rows[0].id, profile.provider, profile.socialId],
      );
      await client.query('COMMIT');
      return this.mapUser(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async linkSocialAccount(userId: string, provider: SocialProvider, socialId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_social_accounts (user_id, social_provider, social_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (social_provider, social_id) DO NOTHING`,
      [userId, provider, socialId],
    );
  }

  async updateProfile(userId: string, nickname: string | null, profileImage: string | null): Promise<void> {
    await this.pool.query(
      `UPDATE users SET
         nickname = COALESCE($2, nickname),
         profile_image = COALESCE($3, profile_image)
       WHERE id = $1`,
      [userId, nickname, profileImage],
    );
  }

  async deleteById(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  async saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiresAt],
    );
  }

  async findRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1',
      [token],
    );
    if (!rows[0]) return null;
    return { id: rows[0].id, userId: rows[0].user_id, token: rows[0].token, expiresAt: rows[0].expires_at };
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await this.pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  }

  async deleteAllRefreshTokens(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }

  private mapUser(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      nickname: row.nickname as string | null,
      profileImage: row.profile_image as string | null,
      createdAt: row.created_at as Date,
    };
  }
}
