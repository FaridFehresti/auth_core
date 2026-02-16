import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, CreateDateColumn, Index } from 'typeorm';
import { Role } from '../../roles/entities/role.entity';

export enum PermissionScope {
  GLOBAL = 'global',
  MODULE = 'module',
  RESOURCE = 'resource',
}

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  @Index()
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })  // Fixed: explicit type
  description!: string | null;

  @Column({ 
    type: 'enum', 
    enum: PermissionScope, 
    default: PermissionScope.RESOURCE 
  })
  scope!: PermissionScope;

  @Column({ name: 'module_name', type: 'varchar', length: 100, nullable: true })
  moduleName!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resource!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  action!: string | null;

  @Column({ name: 'http_method', type: 'varchar', length: 10, nullable: true })
  httpMethod!: string | null;

  @Column({ name: 'route_path', type: 'text', nullable: true })
  routePath!: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @Column({ default: true })
  isActive!: boolean;

  @ManyToMany(() => Role, role => role.permissions)
  roles!: Role[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}