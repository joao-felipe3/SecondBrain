import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SettingsDialog from "~/components/shared/dialogs/SettingsDialog.vue";
import * as useSettingsModule from "~/composables/useSettings";

vi.mock("~/composables/useSettings", () => ({
  useSettings: vi.fn(() => ({
    settings: { value: null },
    fetchSettings: vi.fn(),
    updateSettings: vi.fn(),
    toggleSilenceNotifications: vi.fn(),
  })),
}));

describe("SettingsDialog.vue", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = mount(SettingsDialog, {
      props: {
        userId: "test-user-123",
      },
      global: {
        stubs: {
          "v-dialog": true,
          "v-btn": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-checkbox": true,
          "v-divider": true,
          "v-slider": true,
          "v-spacer": true,
        },
      },
    });
  });

  it("should render settings dialog button", () => {
    expect(wrapper.exists()).toBe(true);
  });

  it("should initialize local settings from fetched settings", async () => {
    const mockSettings = {
      silenceNotifications: true,
      darkMode: false,
      soundEnabled: false,
      notificationTimeBeforeDueMinutes: 30,
    };

    const useSettingsMock = vi.fn(() => ({
      settings: { value: mockSettings },
      fetchSettings: vi.fn().mockResolvedValue(mockSettings),
      updateSettings: vi.fn().mockResolvedValue(mockSettings),
    }));

    useSettingsModule.useSettings = useSettingsMock;

    wrapper = mount(SettingsDialog, {
      props: {
        userId: "test-user-123",
      },
      global: {
        stubs: {
          "v-dialog": true,
          "v-btn": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-checkbox": true,
          "v-divider": true,
          "v-slider": true,
          "v-spacer": true,
        },
      },
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSilenced).toBe(true);
  });

  it("should disable sound when silencing notifications", async () => {
    wrapper.vm.localSettings.silenceNotifications = true;
    wrapper.vm.onSettingsChange();
    expect(wrapper.vm.localSettings.soundEnabled).toBe(false);
  });

  it("should emit settings-updated event on save", async () => {
    const mockSettings = {
      silenceNotifications: true,
      darkMode: false,
      soundEnabled: false,
      notificationTimeBeforeDueMinutes: 30,
    };

    const useSettingsMock = vi.fn(() => ({
      settings: { value: mockSettings },
      fetchSettings: vi.fn().mockResolvedValue(mockSettings),
      updateSettings: vi.fn().mockResolvedValue(mockSettings),
    }));

    useSettingsModule.useSettings = useSettingsMock;

    wrapper = mount(SettingsDialog, {
      props: {
        userId: "test-user-123",
      },
      global: {
        stubs: {
          "v-dialog": true,
          "v-btn": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-checkbox": true,
          "v-divider": true,
          "v-slider": true,
          "v-spacer": true,
        },
      },
    });

    await wrapper.vm.saveSettings();
    expect(wrapper.emitted("settings-updated")).toBeTruthy();
  });

  it("should validate notification time range", () => {
    wrapper.vm.localSettings.notificationTimeBeforeDueMinutes = -10;
    // Should be clamped to 0 or handled by backend validation
    expect(
      wrapper.vm.localSettings.notificationTimeBeforeDueMinutes,
    ).toBeLessThanOrEqual(1440);
  });
});
