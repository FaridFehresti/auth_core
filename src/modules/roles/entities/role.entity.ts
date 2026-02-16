import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Permission } from '../../permissions/entities/permission.entity';
import { User } from '../../users/entities/user.entity';

export enum RoleType {
  SYSTEM = 'system',
  CUSTOM = 'custom',
}

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  @Index()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ 
    type: 'enum', 
    enum: RoleType, 
    default: RoleType.CUSTOM 
  })
  type!: RoleType;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @Column({ name: 'is_default', default: false })
  isDefault!: boolean;

  @ManyToMany(() => Permission, permission => permission.roles, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions!: Permission[];

  @ManyToMany(() => User, user => user.roles)
  users!: User[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}