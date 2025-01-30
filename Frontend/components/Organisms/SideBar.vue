<template>
    <aside class="sidebar">
        <div class="logo">
            <img src="~/assets/img/logo.png" alt="Logo" />
        </div>

        <h1 class="project-name">Second Brain</h1>

        <MoleculesMenu :menuItems="menuItems" />
        
        <MoleculesProfile />
    </aside>
</template>

<script>
import Menu from '~/components/Molecules/Menu.vue';
import Profile from '~/components/Molecules/Profile.vue'

export default {
    components: {
        Menu,
        Profile,
    },
    data() {
        return {
            menuItems: [
                { icon: 'target-arrow', href: '#' },
                { icon: 'calendar-week', href: '#' },
                { icon: 'gift', href: '#' },
                { icon: 'heart', href: '#' },
                { icon: 'barbell', href: '#' },
            ],
        };
    },
};
</script>

<style scoped>
.sidebar {
    width: 13.75%;
    color: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.logo img {
    width: 100%;
    margin-bottom: 0rem;
    margin-top: 1.5rem;
}

.project-name {
    font-size: 1.8rem;
    font-weight: bold;
    margin-bottom: 1.8rem;
    background: var(--gradient-primary);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-align: center;
    line-height: 1.1;
}
</style>
