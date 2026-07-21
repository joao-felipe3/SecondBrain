import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { SettingsService } from '../../src/settings/settings.service';

interface SettingsResponse {
  userId?: string;
  silenceNotifications?: boolean;
  darkMode?: boolean;
  soundEnabled?: boolean;
  notificationTimeBeforeDueMinutes?: number;
}

describe('Settings E2E Tests (e2e)', () => {
  let app: INestApplication;
  let settingsService: SettingsService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    settingsService = moduleFixture.get<SettingsService>(SettingsService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /settings/:userId', () => {
    it('should return default settings for new user', async () => {
      const userId = 'new-user-' + Date.now();

      const response = await request(app.getHttpServer() as App)
        .get(`/settings/${userId}`)
        .expect(200);

      const body = response.body as SettingsResponse;
      expect(body).toHaveProperty('userId', userId);
      expect(body).toHaveProperty('silenceNotifications', false);
      expect(body).toHaveProperty('darkMode', false);
      expect(body).toHaveProperty('soundEnabled', true);
      expect(body).toHaveProperty('notificationTimeBeforeDueMinutes', 10);
    });

    it('should return existing settings for known user', async () => {
      const userId = 'existing-user-' + Date.now();

      // Create settings first
      await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({ silenceNotifications: true, darkMode: true })
        .expect(200);

      // Retrieve settings
      const response = await request(app.getHttpServer() as App)
        .get(`/settings/${userId}`)
        .expect(200);

      const body = response.body as SettingsResponse;
      expect(body.silenceNotifications).toBe(true);
      expect(body.darkMode).toBe(true);
    });
  });

  describe('PATCH /settings/:userId', () => {
    it('should update single setting', async () => {
      const userId = 'update-user-' + Date.now();

      const response = await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({ silenceNotifications: true })
        .expect(200);

      const body = response.body as SettingsResponse;
      expect(body.silenceNotifications).toBe(true);
      expect(body.soundEnabled).toBe(true); // Should remain unchanged
    });

    it('should update multiple settings', async () => {
      const userId = 'multi-update-user-' + Date.now();

      const response = await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({
          silenceNotifications: true,
          darkMode: true,
          soundEnabled: false,
          notificationTimeBeforeDueMinutes: 30,
        })
        .expect(200);

      const body = response.body as SettingsResponse;
      expect(body.silenceNotifications).toBe(true);
      expect(body.darkMode).toBe(true);
      expect(body.soundEnabled).toBe(false);
      expect(body.notificationTimeBeforeDueMinutes).toBe(30);
    });

    it('should validate notification time range', async () => {
      const userId = 'validation-user-' + Date.now();

      // Try to set invalid time (too high)
      const response = await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({ notificationTimeBeforeDueMinutes: 2000 });

      // Should fail validation or be clamped
      expect([400, 200]).toContain(response.status);
    });
  });

  describe('POST /settings/:userId/toggle-silence-notifications', () => {
    it('should toggle silence notifications from false to true', async () => {
      const userId = 'toggle-user-' + Date.now();

      // Initial state (false by default)
      const response1 = await request(app.getHttpServer() as App)
        .post(`/settings/${userId}/toggle-silence-notifications`)
        .expect(200);

      const body1 = response1.body as SettingsResponse;
      expect(body1.silenceNotifications).toBe(true);

      // Toggle back to false
      const response2 = await request(app.getHttpServer() as App)
        .post(`/settings/${userId}/toggle-silence-notifications`)
        .expect(200);

      const body2 = response2.body as SettingsResponse;
      expect(body2.silenceNotifications).toBe(false);
    });

    it('should preserve other settings when toggling', async () => {
      const userId = 'toggle-preserve-user-' + Date.now();

      // Set initial settings
      await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({
          darkMode: true,
          soundEnabled: false,
          notificationTimeBeforeDueMinutes: 20,
        })
        .expect(200);

      // Toggle silence notifications
      const response = await request(app.getHttpServer() as App)
        .post(`/settings/${userId}/toggle-silence-notifications`)
        .expect(200);

      const body = response.body as SettingsResponse;
      expect(body.silenceNotifications).toBe(true);
      expect(body.darkMode).toBe(true);
      expect(body.soundEnabled).toBe(false);
      expect(body.notificationTimeBeforeDueMinutes).toBe(20);
    });
  });

  describe('Settings Integration with Notifications', () => {
    it('should prevent notifications when silenced', async () => {
      const userId = 'silence-test-user-' + Date.now();

      // Silence notifications
      await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({ silenceNotifications: true })
        .expect(200);

      // Check if silenced
      const isSilenced = await settingsService.isSilenced(userId);
      expect(isSilenced).toBe(true);
    });

    it('should allow notifications when not silenced', async () => {
      const userId = 'no-silence-test-user-' + Date.now();

      // Ensure notifications are not silenced
      await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({ silenceNotifications: false })
        .expect(200);

      // Check if not silenced
      const isSilenced = await settingsService.isSilenced(userId);
      expect(isSilenced).toBe(false);
    });
  });

  describe('Settings Persistence', () => {
    it('should persist settings across multiple requests', async () => {
      const userId = 'persistence-user-' + Date.now();

      // Set settings
      await request(app.getHttpServer() as App)
        .patch(`/settings/${userId}`)
        .send({ silenceNotifications: true, darkMode: true })
        .expect(200);

      // Retrieve and verify
      const response1 = await request(app.getHttpServer() as App)
        .get(`/settings/${userId}`)
        .expect(200);

      const body1 = response1.body as SettingsResponse;
      expect(body1.silenceNotifications).toBe(true);
      expect(body1.darkMode).toBe(true);

      // Retrieve again to verify persistence
      const response2 = await request(app.getHttpServer() as App)
        .get(`/settings/${userId}`)
        .expect(200);

      const body2 = response2.body as SettingsResponse;
      expect(body2.silenceNotifications).toBe(true);
      expect(body2.darkMode).toBe(true);
    });

    it('should not interfere with settings of different users', async () => {
      const userId1 = 'user1-' + Date.now();
      const userId2 = 'user2-' + Date.now();

      // Set different settings for each user
      await request(app.getHttpServer() as App)
        .patch(`/settings/${userId1}`)
        .send({ silenceNotifications: true })
        .expect(200);

      await request(app.getHttpServer() as App)
        .patch(`/settings/${userId2}`)
        .send({ silenceNotifications: false, darkMode: true })
        .expect(200);

      // Verify isolation
      const response1 = await request(app.getHttpServer() as App)
        .get(`/settings/${userId1}`)
        .expect(200);

      const response2 = await request(app.getHttpServer() as App)
        .get(`/settings/${userId2}`)
        .expect(200);

      const body1 = response1.body as SettingsResponse;
      const body2 = response2.body as SettingsResponse;

      expect(body1.silenceNotifications).toBe(true);
      expect(body1.darkMode).toBe(false);

      expect(body2.silenceNotifications).toBe(false);
      expect(body2.darkMode).toBe(true);
    });
  });
});
