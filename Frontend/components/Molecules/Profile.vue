<template>
  <div class="profile">
    <div class="profile-header" @click="toggleProfileVisibility" ref="profileButton">
      <SvgIcon name="user" :style="{ width: '40px', height: '40px', stroke: 'currentColor' }" />
    </div>

    <teleport to="body">
      <div 
        v-if="isProfileVisible" 
        class="profile-dialog" 
        :style="dialogPosition"
        ref="profileDialog"
      >
        <div class="profile-info">
          <h2 class="profile-name">João Felipe</h2>
          <p class="profile-description">Desenvolvedor Frontend | Criador de soluções digitais</p>
        </div>

        <div class="profile-actions">
          <button class="action-button">Editar</button>
          <button class="action-button">Sair</button>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, reactive } from 'vue';
import SvgIcon from '~/components/Atoms/SvgIcon.vue';

export default {
  name: "MoleculesProfile",
  components: {
    SvgIcon
  },
  setup() {
    const isProfileVisible = ref(false);
    const profileButton = ref(null);
    const profileDialog = ref(null);
    const dialogPosition = reactive({});

    const toggleProfileVisibility = () => {
      isProfileVisible.value = !isProfileVisible.value;
      if (isProfileVisible.value) {
        setDialogPosition();
      }
    };

    const setDialogPosition = () => {
      const buttonRect = profileButton.value.getBoundingClientRect();
      const dialogWidth = 250; 
      const dialogHeight = 200; 

      
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = buttonRect.top - dialogHeight/2.5; 
      let left = buttonRect.right + 10; 

      if (top < 0) {
        top = buttonRect.bottom + 10; 
      }
      if (left + dialogWidth > viewportWidth) {
        left = buttonRect.left - dialogWidth - 10; 
      }

      dialogPosition.top = `${top}px`;
      dialogPosition.left = `${left}px`;
      dialogPosition.width = `${dialogWidth}px`;
    };

    const handleClickOutside = (event) => {
      if (
        profileDialog.value &&
        !profileDialog.value.contains(event.target) &&
        profileButton.value &&
        !profileButton.value.contains(event.target)
      ) {
        isProfileVisible.value = false;
      }
    };

    onMounted(() => {
      document.addEventListener('click', handleClickOutside);
    });

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleClickOutside);
    });

    return {
      isProfileVisible,
      toggleProfileVisibility,
      profileButton,
      profileDialog,
      dialogPosition,
    };
  },
};
</script>

<style scoped>
.profile {
  position: relative;
}

.profile-header {
  cursor: pointer;
  background-color: #e7e5e5;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  margin-top: 2rem;
  border-radius: 50%;
}

.profile-dialog {
  position: fixed;
  background-color: #fff;
  border: 1px solid #ddd;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 1rem;
  z-index: 1000;
  animation: fadeIn 0.3s ease-in-out;
}

.profile-info {
  text-align: center;
  margin-bottom: 1rem;
}

.profile-name {
  font-size: 1.2rem;
  font-weight: bold;
  color: #333;
}

.profile-description {
  font-size: 0.9rem;
  color: #666;
}

.profile-actions {
  display: flex;
  justify-content: space-around;
}

.action-button {
  background: var(--gradient-primary);
  color: #fff;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s ease;
}

.action-button:hover {
  background: var(--gradient-primary-dark);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
