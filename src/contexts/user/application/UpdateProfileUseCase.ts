import { IUserProfileRepository } from '../ports/IUserProfileRepository';
import { UserProfile } from '../domain/UserProfile';
import { Errors } from '../../../shared/errors/AppError';

// 닉네임 수정. 애플 로그인은 이름을 안 주는 경우가 많아(동의 1회성) 사용자가 직접 설정/변경할 수 있어야 한다.
// 앱: 계정 관리 → 닉네임 설정 화면(PATCH /users/me). 카카오/네이버 닉네임도 여기서 덮어쓸 수 있다.
const MAX_NICKNAME = 20;

export class UpdateProfileUseCase {
  constructor(private readonly userProfileRepo: IUserProfileRepository) {}

  async execute(userId: string, nicknameRaw: string): Promise<UserProfile> {
    const nickname = nicknameRaw.trim();
    if (!nickname) throw Errors.validation({ nickname: '닉네임을 입력해주세요' });
    if (nickname.length > MAX_NICKNAME)
      throw Errors.validation({ nickname: `닉네임은 ${MAX_NICKNAME}자 이하로 입력해주세요` });

    await this.userProfileRepo.updateNickname(userId, nickname);
    const profile = await this.userProfileRepo.findById(userId);
    if (!profile) throw Errors.unauthorized();
    return profile;
  }
}
