import * as Phaser from 'phaser'
import { GuildScene } from '~/game/scenes/GuildScene'
import { TasksScene } from '~/game/scenes/TasksScene'
import { ProjectsScene } from '~/game/scenes/ProjectsScene'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // AUTO prefere WebGL, necessário para GlowFX
  width: 1920,
  height: 1080,
  parent: 'game-container',
  backgroundColor: '#000000',
  scene: [GuildScene, TasksScene, ProjectsScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false 
    }
  }
}
