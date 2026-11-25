import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GrimoireBayShelf from '~/components/features/projects/GrimoireBayShelf.vue';

const makeProjects = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ _id: `p${i + 1}`, name: `Tomo ${i + 1}`, taskCount: 0 }));

describe('GrimoireBayShelf', () => {
  it('mostra 18 tomos por página (3 baias × 2 fileiras × 3 capas)', () => {
    const wrapper = mount(GrimoireBayShelf, { props: { projects: makeProjects(20) } });

    expect(wrapper.findAll('.ui-grimoire-book')).toHaveLength(18);
    expect(wrapper.find('.pager-label').text()).toBe('Página 1 de 2');
  });

  it('pagina para os tomos restantes e volta', async () => {
    const wrapper = mount(GrimoireBayShelf, { props: { projects: makeProjects(20) } });
    const [prev, next] = wrapper.findAll('.pager-arrow');

    await next.trigger('click');
    expect(wrapper.findAll('.ui-grimoire-book')).toHaveLength(2);
    expect(wrapper.find('.pager-label').text()).toBe('Página 2 de 2');
    expect((next.element as HTMLButtonElement).disabled).toBe(true);

    await prev.trigger('click');
    expect(wrapper.findAll('.ui-grimoire-book')).toHaveLength(18);
    expect(wrapper.find('.pager-label').text()).toBe('Página 1 de 2');
  });

  it('esconde a paginação quando todos os tomos cabem em uma página', () => {
    const wrapper = mount(GrimoireBayShelf, { props: { projects: makeProjects(5) } });

    expect(wrapper.find('.pager').exists()).toBe(false);
    expect(wrapper.findAll('.ui-grimoire-book')).toHaveLength(5);
  });

  it('emite select-project com o tomo clicado', async () => {
    const projects = makeProjects(3);
    const wrapper = mount(GrimoireBayShelf, { props: { projects } });

    await wrapper.findAll('.ui-grimoire-book')[1].trigger('click');

    // O primeiro argumento é o tomo; o segundo é a posição da capa (usada na abertura)
    expect(wrapper.emitted('select-project')?.[0]?.[0]).toEqual(projects[1]);
  });

  it('mostra a dica de estante vazia e emite create-project pela placa', async () => {
    const wrapper = mount(GrimoireBayShelf, { props: { projects: [] } });

    expect(wrapper.find('.empty-hint').exists()).toBe(true);
    expect(wrapper.findAll('.ui-grimoire-book')).toHaveLength(0);

    await wrapper.find('.create-plaque').trigger('click');
    expect(wrapper.emitted('create-project')).toHaveLength(1);
  });
});
