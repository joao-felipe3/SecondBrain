import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import WBSTreeNode from '~/components/features/projects/sections/WBSTreeNode.vue';

const invalidLeaf = { _id: 'n1', name: 'Pacote grande', estimatedHours: 120, level: 1, children: [] };
const validLeaf = { _id: 'n2', name: 'Pacote ok', estimatedHours: 20, level: 1, children: [] };

describe('WBSTreeNode', () => {
  it('mostra o botão de correção em pacote inválido no modo de edição', () => {
    const wrapper = mount(WBSTreeNode, {
      props: { node: invalidLeaf, depth: 0, editing: true },
    });

    expect(wrapper.find('.fix-btn').exists()).toBe(true);
    expect(wrapper.find('.edit-btn').exists()).toBe(true);
  });

  it('mostra o botão de correção fora do modo de edição também', () => {
    const wrapper = mount(WBSTreeNode, {
      props: { node: invalidLeaf, depth: 0, editing: false },
    });

    expect(wrapper.find('.fix-btn').exists()).toBe(true);
  });

  it('pede a decomposição ao clicar na correção', async () => {
    const wrapper = mount(WBSTreeNode, {
      props: { node: invalidLeaf, depth: 0, editing: true },
    });

    await wrapper.find('.fix-btn').trigger('click');
    expect(wrapper.emitted('suggest-decomposition')?.[0]).toEqual([invalidLeaf]);
  });

  it('não mostra correção em pacote válido', () => {
    const wrapper = mount(WBSTreeNode, {
      props: { node: validLeaf, depth: 0, editing: true },
    });

    expect(wrapper.find('.fix-btn').exists()).toBe(false);
  });
});
