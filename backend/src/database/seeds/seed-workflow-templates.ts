import dataSource from '../data-source';
import { WorkflowTemplateEntity } from '../entities';
import { systemWorkflowTemplates } from './system-workflow-templates';

async function seedWorkflowTemplates(): Promise<void> {
  const source = await dataSource.initialize();
  const repository = source.getRepository(WorkflowTemplateEntity);

  for (const template of systemWorkflowTemplates) {
    const existing = await repository.findOne({
      where: { name: template.name },
    });

    await repository.save({
      id: existing?.id,
      ...template,
      isSystemTemplate: true,
    });
  }

  await source.destroy();
}

void seedWorkflowTemplates().catch(async (error: unknown) => {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }

  console.error(error);
  process.exitCode = 1;
});
