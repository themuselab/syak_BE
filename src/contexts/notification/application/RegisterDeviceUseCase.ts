import { IAppNewsRepository } from '../ports/IAppNewsRepository';
import { RegisterDeviceInput } from '../domain/AppNews';

export class RegisterDeviceUseCase {
  constructor(private readonly repo: IAppNewsRepository) {}

  async execute(input: RegisterDeviceInput): Promise<void> {
    await this.repo.upsertDevice(input);
  }
}
