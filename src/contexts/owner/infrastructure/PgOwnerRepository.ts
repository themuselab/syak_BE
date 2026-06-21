import { Pool } from 'pg';
import { IOwnerRepository } from '../ports/IOwnerRepository';
import { OwnerAccount, SocialProvider, OwnerSocialProfile } from '../domain/Owner';

export class PgOwnerRepository implements IOwnerRepository {
  constructor(private readonly pool: Pool) {}

  async findBySocial(provider: SocialProvider, socialId: string): Promise<OwnerAccount | null> {
    const { rows } = await this.pool.query(
      `SELECT o.id, o.shop_id, o.nickname, o.profile_image, o.created_at
       FROM owner_accounts o
       JOIN owner_social_accounts sa ON sa.owner_id = o.id
       WHERE sa.social_provider = $1 AND sa.social_id = $2`,
      [provider, socialId],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findById(id: string): Promise<OwnerAccount | null> {
    const { rows } = await this.pool.query(
      'SELECT id, shop_id, nickname, profile_image, created_at FROM owner_accounts WHERE id = $1',
      [id],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async createWithSocial(profile: OwnerSocialProfile): Promise<OwnerAccount> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO owner_accounts (nickname, profile_image) VALUES ($1, $2) RETURNING *',
        [profile.nickname ?? null, profile.profileImage ?? null],
      );
      await client.query(
        `INSERT INTO owner_social_accounts (owner_id, social_provider, social_id)
         VALUES ($1, $2, $3)`,
        [rows[0].id, profile.provider, profile.socialId],
      );
      await client.query('COMMIT');
      return this.map(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateProfile(ownerId: string, nickname?: string, profileImage?: string): Promise<void> {
    await this.pool.query(
      `UPDATE owner_accounts SET
         nickname      = COALESCE($2, nickname),
         profile_image = COALESCE($3, profile_image)
       WHERE id = $1`,
      [ownerId, nickname ?? null, profileImage ?? null],
    );
  }

  async linkShop(ownerId: string, shopId: string): Promise<void> {
    await this.pool.query(
      'UPDATE owner_accounts SET shop_id = $2 WHERE id = $1',
      [ownerId, shopId],
    );
  }

  async saveRefreshToken(ownerId: string, token: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      'INSERT INTO owner_refresh_tokens (token, owner_id, expires_at) VALUES ($1, $2, $3)',
      [token, ownerId, expiresAt],
    );
  }

  async findByRefreshToken(token: string): Promise<OwnerAccount | null> {
    const { rows } = await this.pool.query(
      `SELECT o.id, o.shop_id, o.nickname, o.profile_image, o.created_at
       FROM owner_accounts o
       JOIN owner_refresh_tokens rt ON rt.owner_id = o.id
       WHERE rt.token = $1 AND rt.expires_at > now()`,
      [token],
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await this.pool.query('DELETE FROM owner_refresh_tokens WHERE token = $1', [token]);
  }

  async deleteAllRefreshTokens(ownerId: string): Promise<void> {
    await this.pool.query('DELETE FROM owner_refresh_tokens WHERE owner_id = $1', [ownerId]);
  }

  private map(row: Record<string, unknown>): OwnerAccount {
    return {
      id:           row.id as string,
      shopId:       (row.shop_id as string) ?? null,
      nickname:     (row.nickname as string) ?? null,
      profileImage: (row.profile_image as string) ?? null,
      createdAt:    row.created_at as Date,
    };
  }
}
