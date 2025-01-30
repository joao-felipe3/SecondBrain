<template>
  <nav class="menu">
    <ul>
      <li v-for="(item, index) in menuItems" :key="index" :class="{ 'selected': selectedItem === index }"
        @click="toggleSelect(index)">
        <div class="background-circle"></div>
        <div class="background-circle2"></div>
        <a :href="item.href">
          <SvgIcon :name="item.icon" :style="{ width: '42px', height: '42px' }" :class="'icon-class'" />
        </a>
      </li>
    </ul>
  </nav>
</template>

<script>
import SvgIcon from "~/components/Atoms/SvgIcon.vue";

export default {
  props: {
    menuItems: {
      type: Array,
      required: true,
      default: () => [],
    },
  },
  components: {
    SvgIcon,
  },
  data() {
    return {
      selectedItem: null,
    };
  },
  methods: {
    toggleSelect(index) {
      this.selectedItem = this.selectedItem === index ? null : index;
    },
  },
};
</script>

<style scoped>
.menu ul {
  list-style: none;
  background-color: #e7e5e5;
  padding: 0;
  margin: 0;
  width: 100%;
  border-radius: 3rem;
}

.menu ul li:first-child {
  padding-top: 1rem;
}

.menu ul li:last-child {
  padding-bottom: 1rem;
}

.menu ul li {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.3s ease;
  position: relative;
}

.menu ul li .background-circle {
  position: absolute;
  width: 50px;
  height: 50px;
  background: var(--gradient-primary);
  border-radius: 50%;
  z-index: 0;
  display: none;
  transition: transform 0.3s ease;
}

.menu ul li.selected .background-circle {
  display: block;
  z-index: 0;
}

.menu ul li .background-circle2 {
  position: absolute;
  width: 50px;
  height: 50px;
  background: var(--gradient-primary);
  border-radius: 50%;
  z-index: 1;
  display: none;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
  filter: blur(3px);
}

.menu ul li.selected .background-circle2 {
  display: block;
  z-index: 1;
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.8);
  filter: blur(8px);
  transition: transform 0.6s ease, box-shadow 0.6s ease, filter 0.6s ease;
}

.menu ul li:hover .background-circle {
  display: block;
}

.menu ul li:active {
  transform: scale(0.85);
}

.menu ul li a {
  color: #000;
  text-decoration: none;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 2rem;
  transition: background-color 0.3s;
  z-index: 2;
}

.menu ul li.selected a {
  z-index: 2;
  color: white;
}

.menu ul li a:hover {
  color: white;
}

.menu ul li a:hover .icon-class {
  stroke: currentColor;
}
</style>