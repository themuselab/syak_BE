import { Pool } from 'pg';
import { IUserProfileRepository } from '../ports/IUserProfileRepository';
import { UserProfile } from '../domain/UserProfile';
import { SocialProvider } from '../../auth/domain/User';

export class PgUserProfileRepository implements IUserProfileRepository {
  constructor(private readonly pool: Pool) {}

  async findById(userId: string): Promise<UserProfile | null> {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.nickname, u.profile_image, u.created_at,
              ARRAY_AGG(sa.social_provider ORDER BY sa.created_at) AS linked_providers
       FROM users u
       LEFT JOIN user_social_accounts sa ON sa.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      linkedProviders: (r.linked_providers ?? []).filter(Boolean) as SocialProvider[],
      nickname: r.nickname,
      profileImage: r.profile_image,
      createdAt: r.created_at,
    };
  }

  async deleteById(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
}
