  <template>
    <div class="radio-input" :style="{ '--container_width': containerWidth }">
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
        {{ option.label }}
      </label>
      <div
        class="selection"
        :style="{ transform: `translateX(calc(var(--container_width) * ${selectedIndex} / ${options.length}))` }"
      ></div>
    </div>
  </template>

  <script>
  export default {
    name: 'RadioInput',
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
        default: '250px',
      },
    },
    data() {
      return {
        localValue: this.modelValue, // Sincroniza o valor inicial
        selectedIndex: 0, // Índice da opção selecionada
      };
    },
    watch: {
      modelValue(newVal) {
        this.localValue = newVal; // Atualiza o valor local quando o modelValue mudar
        this.selectedIndex = this.options.findIndex(
          (option) => option.value === newVal
        );
      },
    },
    methods: {
      updateSelection(value, index) {
        this.localValue = value;
        this.selectedIndex = index;
        this.$emit('update:modelValue', value); // Emite o evento para o v-model
      },
    },
  };
  </script>



<style scoped>
  .radio-input {
    --container_width: 250px;
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 50px;
    background-color: #CBCBCB;
    color: #000;
    width: var(--container_width);
    overflow: hidden;
    border: 1px solid #ccc;
  }

  .radio-input label {
    width: 100%;
    padding: 6px;
    padding-right: 10px;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: 400; /* Peso padrão para não selecionado */
    letter-spacing: -1px;
    font-size: 14px;
    color: #555; /* Cor padrão para não selecionado */
    transition: color 0.15s ease, font-weight 0.15s ease; /* Transições suaves */
    position: relative; /* Necessário para o divider */
  }

  .radio-input input {
    display: none;
  }

  .radio-input label::after {
    content: '';
    position: absolute;
    right: 0;
    top: 10%; /* Ajuste vertical */
    height: 80%; /* Altura do divisor */
    width: 1px; /* Espessura do divisor */
    background-color: #999; /* Cor do divisor */
  }

  .radio-input label:nth-last-of-type(1)::after {
    display: none; /* Remove o divisor do último elemento */
  }

  .radio-input label:has(input:checked) {
    background: var(--gradient-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-weight: 800; /* Peso do texto quando selecionado */
  }

</style>
