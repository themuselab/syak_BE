import { SlotListener } from '../slotListener';
import { DispatchSlotNotificationsUseCase } from '../../../contexts/notification/application/DispatchSlotNotificationsUseCase';

jest.mock('pg', () => {
  const mockClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({}),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
  return { Client: jest.fn(() => mockClient) };
});

function makeDispatch(): DispatchSlotNotificationsUseCase {
  return { execute: jest.fn().mockResolvedValue({ dispatched: 1 }) } as unknown as DispatchSlotNotificationsUseCase;
}

describe('SlotListener', () => {
  it('start()가 LISTEN 쿼리를 실행한다', async () => {
    const { Client } = require('pg');
    const dispatch = makeDispatch();
    const listener = new SlotListener(dispatch);

    await listener.start();

    const client = Client.mock.results[0].value;
    expect(client.connect).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('LISTEN slot_inserted');
  });

  it('stop()이 client.end()를 호출한다', async () => {
    const { Client } = require('pg');
    const listener = new SlotListener(makeDispatch());
    await listener.start();
    await listener.stop();

    const client = Client.mock.results[0].value;
    expect(client.end).toHaveBeenCalled();
  });
});
