import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'settings', timestamps: true })
export class Settings extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop({ default: false })
  silenceNotifications: boolean;

  @Prop({ default: false })
  darkMode: boolean;

  @Prop({ default: false })
  soundEnabled: boolean;

  @Prop({ default: 10 })
  notificationTimeBeforeDueMinutes: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
SettingsSchema.index({ userId: 1 });
