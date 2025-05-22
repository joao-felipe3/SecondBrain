<template>
  <div
    class="w-100 h-100 flex-grow-1"
    style="
      background-image: url('/svg/wooden2.svg');
      background-size: 100% 100%;
      background-position: center
    "
  ></div>
  <v-img
    src="svg/old-paper-3.svg"
    alt="Old Paper"
    width="14%"
    class="position-absolute"
    style="top:21.5%; left: 38.5%; z-index: 10;"
    contain
  />
  <svg
    class="position-absolute"
    style="top: 19.5%; left: 33%; width: 25%; height: auto; z-index: 11;"
    viewBox="0 0 300 150"
  >
    <defs>
      <path 
        id="curve"
        d="M10,90 Q150,10 290,90"
        fill="transparent"
      />
    </defs>
    <text 
      fill="black"
      font-size="40"
      font-family="'Irish Grover', cursive"
      font-weight="600"
    >
      <textPath 
        href="#curve" 
        startOffset="50%"
        text-anchor="middle"
      >
        Tasks
      </textPath>
    </text>
  </svg>
</template>
