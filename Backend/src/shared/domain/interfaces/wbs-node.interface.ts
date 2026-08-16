export interface IWBSNodeDomain {
  id?: string;
  projectId?: string;
  code?: string;
  name: string;
  description?: string;
  estimatedHours?: number;
  level?: number;
  parentId?: string | null;
  children?: IWBSNodeDomain[];
  isLeaf?: boolean;
}
