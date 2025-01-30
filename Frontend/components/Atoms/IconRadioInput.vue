<template>
  <div class="icon-radio-input" :style="{ '--container_width': containerWidth }">
    <label
      v-for="(option, index) in options"
      :key="option.value"
      :class="{ selected: option.value === modelValue }"
      @click="updateSelection(option.value, index)"
    >
      <input
        type="radio"
        :value="option.value"
        v-model="localValue"
        style="display: none;"
      />
      <SvgIcon
        :name="option.icon"
        :className="option.value === modelValue ? 'icon selected' : 'icon'"
        :style="{ width: '22px', height: '22px' }"
      />
    </label>
    <div
      class="selection"
      :style="{ transform: `translateX(calc(var(--container_width) * ${selectedIndex} / ${options.length}))` }"
    ></div>
  </div>
</template>

<script>
import SvgIcon from '~/components/Atoms/SvgIcon.vue'; // Certifique-se de ajustar o caminho para o componente de ícones dinâmicos

export default {
  name: "IconRadioInput",
  components: {
    SvgIcon,
  },
  props: {
    options: {
      type: Array,
      required: true,
    },
    modelValue: {
      type: String,
      default: null,
    },
    containerWidth: {
      type: String,
      default: "250px",
    },
  },
  data() {
    return {
      localValue: this.modelValue,
      selectedIndex: 0,
    };
  },
  watch: {
    modelValue(newVal) {
      this.localValue = newVal;
      this.selectedIndex = this.options.findIndex(
        (option) => option.value === newVal
      );
    },
  },
  methods: {
    updateSelection(value, index) {
      this.localValue = value;
      this.selectedIndex = index;
      this.$emit("update:modelValue", value);
    },
  },
};
</script>

<style scoped>
.icon-radio-input {
  --container_width: 250px;
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 50px;
  background-color: #cbcbcb;
  width: var(--container_width);
  overflow: hidden;
  border: 1px solid #ccc;
}

.icon-radio-input label {
  width: 100%;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.2s ease, color 0.15s ease;
  position: relative;
}

.icon-radio-input label .icon {
  font-size: 24px;
  transition: color 0.15s ease;
}

.icon-radio-input label.selected .icon {
  color: #000;
  font-weight: bold;
}

.icon-radio-input input {
  display: none;
}

.icon {
  color: #555; /* Cor padrão */
  transition: color 0.15s ease;
}

.icon.selected {
  color: #000; /* Cor para o ícone selecionado */
}

</style>
