# SecondBrain

## Feature 1

### **Gerenciamento de Tarefas**

O **TaskBrain** oferece uma funcionalidade completa para gerenciar tarefas, ajudando o usuário a organizar suas atividades de forma eficiente e prática.

#### **Descrição**
A funcionalidade de Gerenciamento de Tarefas permite:
- Criar, editar e excluir tarefas.
- Atribuir atributos como **nome**, **descrição**, **prazo**, **prioridade** e **dificuldade**.
- Visualizar todas as tarefas pendentes em uma lista organizada.
- Associar as tarefas ao calendário do sistema para facilitar o planejamento.

#### **Como Usar**
1. **Acessar a Aba de Tarefas**  
   No menu principal, selecione a opção "Tarefas".

2. **Criar uma Nova Tarefa**  
   - Clique no botão "Nova Tarefa".  
   - Preencha os seguintes campos:  
     - **Nome:** O título da tarefa.  
     - **Descrição:** Detalhes adicionais sobre a tarefa (opcional).  
     - **Prazo:** Data e hora limite para a conclusão da tarefa.  
     - **Prioridade:** Baixa, Média ou Alta.  
     - **Dificuldade:** Fácil, Médio ou Difícil.  
   - Clique em "Salvar" para registrar a tarefa.

3. **Editar uma Tarefa Existente**  
   - Selecione a tarefa na lista.  
   - Clique em "Editar".  
   - Altere os campos desejados e clique em "Salvar".

4. **Excluir uma Tarefa**  
   - Selecione a tarefa na lista.  
   - Clique em "Excluir".  
   - Confirme a exclusão quando solicitado.

#### **Mensagens de Erro**
- **Campos obrigatórios não preenchidos:**  
  Caso o nome ou o prazo não sejam informados, o sistema exibirá a mensagem:  
  `Erro: Preencha todos os campos obrigatórios.`

- **Data inválida:**  
  Se o prazo informado for anterior à data atual, o sistema exibirá:  
  `Erro: O prazo deve ser maior que a data atual.`