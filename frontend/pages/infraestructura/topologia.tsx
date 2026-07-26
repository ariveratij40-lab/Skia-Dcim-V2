import { useState } from 'react';
import Head from 'next/head';
import {
  Network, Database, Grid3x3, Layers, Zap, Radio, Server, Package,
  Map, RefreshCw, Download, Maximize2,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';
import IsometricTopology, { TopoNode, TopoEdge } from '../../components/IsometricTopology';

// ─── Tab definition ───────────────────────────────────────────────────────────
interface TopoTab {
  id: string;
  label: string;
  icon: any;
  description: string;
  nodes: TopoNode[];
  edges: TopoEdge[];
}

// ─── Dataset per module ───────────────────────────────────────────────────────
const TABS: TopoTab[] = [
  // ── MDF / IDF ──────────────────────────────────────────────────────────────
  {
    id: 'mdf-idf',
    label: 'MDF / IDF',
    icon: Database,
    description: 'Distribución de cuartos de telecomunicaciones',
    nodes: [
      { id: 'mdf-a',  label: 'MDF Torre A',     sublabel: 'Piso 1',    kind: 'mdf',     status: 'online',   x: 3, y: 2, meta: { Ubicación: 'Piso 1', Racks: 4, Estado: 'Operativo' } },
      { id: 'mdf-b',  label: 'MDF Torre B',     sublabel: 'Piso 1',    kind: 'mdf',     status: 'online',   x: 5, y: 4, meta: { Ubicación: 'Piso 1', Racks: 2, Estado: 'Operativo' } },
      { id: 'idf-1',  label: 'IDF Piso 3',      sublabel: 'Torre A',   kind: 'idf',     status: 'online',   x: 1, y: 1, meta: { Piso: 3, Racks: 1, Estado: 'Operativo' } },
      { id: 'idf-2',  label: 'IDF Piso 5',      sublabel: 'Torre A',   kind: 'idf',     status: 'warning',  x: 1, y: 4, meta: { Piso: 5, Racks: 1, Estado: 'Atención' } },
      { id: 'idf-3',  label: 'IDF Piso 8',      sublabel: 'Torre A',   kind: 'idf',     status: 'online',   x: 1, y: 7, meta: { Piso: 8, Racks: 1, Estado: 'Operativo' } },
      { id: 'idf-4',  label: 'IDF Prod',        sublabel: 'Área Prod', kind: 'idf',     status: 'online',   x: 4, y: 6, meta: { Área: 'Producción', Racks: 2, Estado: 'Operativo' } },
      { id: 'idf-5',  label: 'IDF Bodega',      sublabel: 'Planta B',  kind: 'idf',     status: 'offline',  x: 6, y: 2, meta: { Área: 'Bodega', Racks: 1, Estado: 'Fuera de línea' } },
      { id: 'dc',     label: 'Datacenter',      sublabel: 'DC Princ.', kind: 'server',  status: 'online',   x: 3, y: 5, meta: { Tipo: 'Datacenter', Racks: 8, Estado: 'Operativo' } },
      { id: 'inet',   label: 'INTERNET',        sublabel: '',          kind: 'internet',status: 'online',   x: 3, y: 0, meta: {} },
    ],
    edges: [
      { from: 'inet',  to: 'mdf-a',  style: 'fiber',  label: 'Fibra' },
      { from: 'inet',  to: 'mdf-b',  style: 'fiber',  label: 'Fibra' },
      { from: 'mdf-a', to: 'idf-1',  style: 'fiber' },
      { from: 'mdf-a', to: 'idf-2',  style: 'fiber' },
      { from: 'mdf-a', to: 'idf-3',  style: 'fiber' },
      { from: 'mdf-a', to: 'dc',     style: 'fiber',  label: '10G' },
      { from: 'mdf-b', to: 'idf-4',  style: 'fiber' },
      { from: 'mdf-b', to: 'idf-5',  style: 'dashed' },
      { from: 'dc',    to: 'mdf-b',  style: 'fiber',  label: '10G' },
    ],
  },

  // ── Racks ──────────────────────────────────────────────────────────────────
  {
    id: 'racks',
    label: 'Racks',
    icon: Grid3x3,
    description: 'Distribución física de racks en instalaciones',
    nodes: [
      { id: 'r-mdf-a',  label: 'RCK-MDF-A',   sublabel: 'Equipo Activo', kind: 'rack', status: 'online',   x: 2, y: 2, meta: { Capacidad: '45U', Uso: '84%', Tipo: 'Equipo Activo' } },
      { id: 'r-idf2',   label: 'RCK-IDF2',    sublabel: 'Cableado',      kind: 'rack', status: 'online',   x: 0, y: 1, meta: { Capacidad: '48U', Uso: '25%', Tipo: 'Cableado' } },
      { id: 'r-idf3',   label: 'RCK-IDF3',    sublabel: 'Cableado',      kind: 'rack', status: 'planned',  x: 0, y: 4, meta: { Capacidad: '24U', Uso: '0%',  Tipo: 'Cableado' } },
      { id: 'r-cctv',   label: 'RCK-CCTV',    sublabel: 'CCTV',          kind: 'rack', status: 'online',   x: 4, y: 1, meta: { Capacidad: '42U', Uso: '43%', Tipo: 'CCTV' } },
      { id: 'r-tel',    label: 'RCK-TEL',     sublabel: 'Telefonía',     kind: 'rack', status: 'warning',  x: 4, y: 4, meta: { Capacidad: '42U', Uso: '71%', Tipo: 'Telefonía' } },
      { id: 'r-srv',    label: 'RCK-SRV',     sublabel: 'Servidores',    kind: 'rack', status: 'critical', x: 2, y: 5, meta: { Capacidad: '48U', Uso: '96%', Tipo: 'Servidores' } },
      { id: 'r-dc',     label: 'RCK-DC-01',   sublabel: 'Datacenter',    kind: 'rack', status: 'online',   x: 6, y: 3, meta: { Capacidad: '42U', Uso: '60%', Tipo: 'Equipo Activo' } },
    ],
    edges: [
      { from: 'r-mdf-a', to: 'r-idf2',  style: 'fiber',  label: 'Backbone' },
      { from: 'r-mdf-a', to: 'r-idf3',  style: 'dashed', label: 'Planeado' },
      { from: 'r-mdf-a', to: 'r-srv',   style: 'fiber',  label: '10G' },
      { from: 'r-mdf-a', to: 'r-dc',    style: 'fiber' },
      { from: 'r-cctv',  to: 'r-mdf-a', style: 'solid' },
      { from: 'r-tel',   to: 'r-mdf-a', style: 'solid' },
      { from: 'r-srv',   to: 'r-dc',    style: 'fiber',  label: '10G' },
    ],
  },

  // ── Switches ───────────────────────────────────────────────────────────────
  {
    id: 'switches',
    label: 'Switches',
    icon: Zap,
    description: 'Topología de red de switches y distribución de VLANs',
    nodes: [
      { id: 'sw-core-1', label: 'SW-CORE-01',  sublabel: 'Core L3',     kind: 'switch', status: 'online',   x: 3, y: 2, meta: { Modelo: 'Cisco C9500', Puertos: 48, VLANs: 12 } },
      { id: 'sw-core-2', label: 'SW-CORE-02',  sublabel: 'Core L3',     kind: 'switch', status: 'online',   x: 5, y: 2, meta: { Modelo: 'Cisco C9500', Puertos: 48, VLANs: 12 } },
      { id: 'sw-dist-1', label: 'SW-DIST-01',  sublabel: 'Distribución',kind: 'switch', status: 'online',   x: 1, y: 1, meta: { Modelo: 'Cisco C9300', Puertos: 24, VLANs: 6 } },
      { id: 'sw-dist-2', label: 'SW-DIST-02',  sublabel: 'Distribución',kind: 'switch', status: 'warning',  x: 1, y: 4, meta: { Modelo: 'Cisco C9300', Puertos: 24, VLANs: 6 } },
      { id: 'sw-acc-1',  label: 'SW-ACC-01',   sublabel: 'Acceso P3',   kind: 'switch', status: 'online',   x: 0, y: 0, meta: { Modelo: 'Cisco C2960', Puertos: 48, VLANs: 3 } },
      { id: 'sw-acc-2',  label: 'SW-ACC-02',   sublabel: 'Acceso P5',   kind: 'switch', status: 'online',   x: 0, y: 3, meta: { Modelo: 'Cisco C2960', Puertos: 48, VLANs: 3 } },
      { id: 'sw-acc-3',  label: 'SW-ACC-03',   sublabel: 'Acceso P8',   kind: 'switch', status: 'online',   x: 0, y: 6, meta: { Modelo: 'Cisco C2960', Puertos: 48, VLANs: 3 } },
      { id: 'sw-acc-4',  label: 'SW-ACC-04',   sublabel: 'Acceso Prod', kind: 'switch', status: 'online',   x: 4, y: 5, meta: { Modelo: 'Cisco C2960', Puertos: 24, VLANs: 2 } },
      { id: 'sw-acc-5',  label: 'SW-ACC-05',   sublabel: 'Acceso DC',   kind: 'switch', status: 'critical', x: 6, y: 3, meta: { Modelo: 'Cisco C2960', Puertos: 24, VLANs: 4 } },
      { id: 'inet',      label: 'INTERNET',    sublabel: '',            kind: 'internet',status: 'online',  x: 4, y: 0, meta: {} },
    ],
    edges: [
      { from: 'inet',      to: 'sw-core-1', style: 'fiber', label: 'WAN' },
      { from: 'inet',      to: 'sw-core-2', style: 'fiber', label: 'WAN' },
      { from: 'sw-core-1', to: 'sw-core-2', style: 'fiber', label: 'LAG' },
      { from: 'sw-core-1', to: 'sw-dist-1', style: 'fiber', label: '10G' },
      { from: 'sw-core-1', to: 'sw-dist-2', style: 'fiber', label: '10G' },
      { from: 'sw-core-2', to: 'sw-dist-1', style: 'fiber' },
      { from: 'sw-core-2', to: 'sw-acc-5',  style: 'fiber', label: '10G' },
      { from: 'sw-dist-1', to: 'sw-acc-1',  style: 'solid' },
      { from: 'sw-dist-1', to: 'sw-acc-2',  style: 'solid' },
      { from: 'sw-dist-2', to: 'sw-acc-3',  style: 'solid' },
      { from: 'sw-dist-2', to: 'sw-acc-4',  style: 'solid' },
    ],
  },

  // ── Backbone ───────────────────────────────────────────────────────────────
  {
    id: 'backbone',
    label: 'Backbone',
    icon: Layers,
    description: 'Red troncal de fibra óptica entre edificios y pisos',
    nodes: [
      { id: 'bb-mdf-a', label: 'MDF Torre A',  sublabel: 'Nodo Central', kind: 'mdf',      status: 'online',  x: 3, y: 3, meta: { Tipo: 'Fibra SM', Velocidad: '10G', Puertos: 12 } },
      { id: 'bb-mdf-b', label: 'MDF Torre B',  sublabel: 'Nodo Central', kind: 'mdf',      status: 'online',  x: 5, y: 3, meta: { Tipo: 'Fibra SM', Velocidad: '10G', Puertos: 8 } },
      { id: 'bb-dc',    label: 'Datacenter',   sublabel: 'DC Principal', kind: 'server',   status: 'online',  x: 4, y: 1, meta: { Tipo: 'Fibra SM', Velocidad: '40G', Puertos: 24 } },
      { id: 'bb-p3',    label: 'IDF Piso 3',   sublabel: 'Vertical',     kind: 'backbone', status: 'online',  x: 1, y: 1, meta: { Tipo: 'Fibra MM', Velocidad: '1G', Puertos: 6 } },
      { id: 'bb-p5',    label: 'IDF Piso 5',   sublabel: 'Vertical',     kind: 'backbone', status: 'warning', x: 1, y: 3, meta: { Tipo: 'Fibra MM', Velocidad: '1G', Puertos: 6 } },
      { id: 'bb-p8',    label: 'IDF Piso 8',   sublabel: 'Vertical',     kind: 'backbone', status: 'online',  x: 1, y: 5, meta: { Tipo: 'Fibra MM', Velocidad: '1G', Puertos: 6 } },
      { id: 'bb-prod',  label: 'IDF Prod',     sublabel: 'Horizontal',   kind: 'backbone', status: 'online',  x: 5, y: 5, meta: { Tipo: 'Fibra MM', Velocidad: '1G', Puertos: 4 } },
      { id: 'bb-bod',   label: 'IDF Bodega',   sublabel: 'Horizontal',   kind: 'backbone', status: 'offline', x: 6, y: 1, meta: { Tipo: 'Fibra MM', Velocidad: '1G', Puertos: 2 } },
    ],
    edges: [
      { from: 'bb-dc',   to: 'bb-mdf-a', style: 'fiber', label: '40G' },
      { from: 'bb-dc',   to: 'bb-mdf-b', style: 'fiber', label: '40G' },
      { from: 'bb-mdf-a',to: 'bb-mdf-b', style: 'fiber', label: '10G' },
      { from: 'bb-mdf-a',to: 'bb-p3',    style: 'fiber', label: 'Vertical' },
      { from: 'bb-mdf-a',to: 'bb-p5',    style: 'fiber', label: 'Vertical' },
      { from: 'bb-mdf-a',to: 'bb-p8',    style: 'fiber', label: 'Vertical' },
      { from: 'bb-mdf-b',to: 'bb-prod',  style: 'fiber', label: 'Horizontal' },
      { from: 'bb-mdf-b',to: 'bb-bod',   style: 'dashed',label: 'Fuera de línea' },
    ],
  },

  // ── Patch Panels ───────────────────────────────────────────────────────────
  {
    id: 'patch-panels',
    label: 'Patch Panels',
    icon: Network,
    description: 'Distribución de patch panels y puntos de red',
    nodes: [
      { id: 'pp-mdf-1', label: 'PP-MDF-01',   sublabel: '48 puertos',  kind: 'patch', status: 'online',  x: 2, y: 2, meta: { Puertos: 48, Ocupados: 42, Tipo: 'Cat6A' } },
      { id: 'pp-mdf-2', label: 'PP-MDF-02',   sublabel: '48 puertos',  kind: 'patch', status: 'online',  x: 4, y: 2, meta: { Puertos: 48, Ocupados: 36, Tipo: 'Cat6A' } },
      { id: 'pp-idf2',  label: 'PP-IDF2-01',  sublabel: '24 puertos',  kind: 'patch', status: 'online',  x: 0, y: 1, meta: { Puertos: 24, Ocupados: 18, Tipo: 'Cat6' } },
      { id: 'pp-idf3',  label: 'PP-IDF3-01',  sublabel: '24 puertos',  kind: 'patch', status: 'planned', x: 0, y: 4, meta: { Puertos: 24, Ocupados: 0,  Tipo: 'Cat6A' } },
      { id: 'pp-cctv',  label: 'PP-CCTV-01',  sublabel: '24 puertos',  kind: 'patch', status: 'online',  x: 4, y: 5, meta: { Puertos: 24, Ocupados: 14, Tipo: 'Cat6' } },
      { id: 'pp-tel',   label: 'PP-TEL-01',   sublabel: '48 puertos',  kind: 'patch', status: 'warning', x: 6, y: 3, meta: { Puertos: 48, Ocupados: 45, Tipo: 'Cat3' } },
      { id: 'sw-core',  label: 'SW-CORE',     sublabel: 'Core Switch', kind: 'switch',status: 'online',  x: 2, y: 5, meta: { Modelo: 'Cisco C9500', Puertos: 48 } },
    ],
    edges: [
      { from: 'pp-mdf-1', to: 'pp-idf2',  style: 'fiber' },
      { from: 'pp-mdf-1', to: 'pp-idf3',  style: 'dashed' },
      { from: 'pp-mdf-1', to: 'sw-core',  style: 'solid' },
      { from: 'pp-mdf-2', to: 'pp-cctv',  style: 'solid' },
      { from: 'pp-mdf-2', to: 'pp-tel',   style: 'solid' },
      { from: 'pp-mdf-2', to: 'sw-core',  style: 'solid' },
      { from: 'pp-mdf-1', to: 'pp-mdf-2', style: 'fiber', label: 'Cross' },
    ],
  },

  // ── Nodos ──────────────────────────────────────────────────────────────────
  {
    id: 'nodos',
    label: 'Nodos',
    icon: Radio,
    description: 'Puntos de red, WAPs y nodos de acceso',
    nodes: [
      { id: 'wap-1',  label: 'WAP-P3-01',   sublabel: 'Piso 3 Ala A',  kind: 'node', status: 'online',   x: 0, y: 0, meta: { Modelo: 'Cisco AIR', Banda: '5GHz', Clientes: 24 } },
      { id: 'wap-2',  label: 'WAP-P3-02',   sublabel: 'Piso 3 Ala B',  kind: 'node', status: 'online',   x: 2, y: 0, meta: { Modelo: 'Cisco AIR', Banda: '5GHz', Clientes: 18 } },
      { id: 'wap-3',  label: 'WAP-P5-01',   sublabel: 'Piso 5 Ala A',  kind: 'node', status: 'warning',  x: 0, y: 2, meta: { Modelo: 'Cisco AIR', Banda: '2.4GHz', Clientes: 31 } },
      { id: 'wap-4',  label: 'WAP-P5-02',   sublabel: 'Piso 5 Ala B',  kind: 'node', status: 'online',   x: 2, y: 2, meta: { Modelo: 'Cisco AIR', Banda: '5GHz', Clientes: 12 } },
      { id: 'wap-5',  label: 'WAP-P8-01',   sublabel: 'Piso 8',        kind: 'node', status: 'online',   x: 0, y: 4, meta: { Modelo: 'Cisco AIR', Banda: '5GHz', Clientes: 8 } },
      { id: 'wap-6',  label: 'WAP-PROD-01', sublabel: 'Producción',    kind: 'node', status: 'online',   x: 4, y: 1, meta: { Modelo: 'Cisco AIR', Banda: '5GHz', Clientes: 45 } },
      { id: 'wap-7',  label: 'WAP-PROD-02', sublabel: 'Producción',    kind: 'node', status: 'critical', x: 4, y: 3, meta: { Modelo: 'Cisco AIR', Banda: '5GHz', Clientes: 0 } },
      { id: 'wap-8',  label: 'WAP-BOD-01',  sublabel: 'Bodega',        kind: 'node', status: 'offline',  x: 6, y: 2, meta: { Modelo: 'Cisco AIR', Banda: '2.4GHz', Clientes: 0 } },
      { id: 'sw-idf2',label: 'SW-IDF2',     sublabel: 'Switch Acceso', kind: 'switch',status: 'online',  x: 1, y: 1, meta: { Modelo: 'Cisco C2960', Puertos: 24 } },
      { id: 'sw-idf3',label: 'SW-IDF3',     sublabel: 'Switch Acceso', kind: 'switch',status: 'online',  x: 1, y: 3, meta: { Modelo: 'Cisco C2960', Puertos: 24 } },
      { id: 'sw-prod',label: 'SW-PROD',     sublabel: 'Switch Acceso', kind: 'switch',status: 'online',  x: 4, y: 2, meta: { Modelo: 'Cisco C2960', Puertos: 48 } },
    ],
    edges: [
      { from: 'sw-idf2', to: 'wap-1',   style: 'solid' },
      { from: 'sw-idf2', to: 'wap-2',   style: 'solid' },
      { from: 'sw-idf2', to: 'wap-3',   style: 'solid' },
      { from: 'sw-idf3', to: 'wap-4',   style: 'solid' },
      { from: 'sw-idf3', to: 'wap-5',   style: 'solid' },
      { from: 'sw-prod',  to: 'wap-6',  style: 'solid' },
      { from: 'sw-prod',  to: 'wap-7',  style: 'dashed' },
      { from: 'sw-prod',  to: 'wap-8',  style: 'dashed' },
    ],
  },

  // ── UPS / PDUs ─────────────────────────────────────────────────────────────
  {
    id: 'ups-pdus',
    label: 'UPS / PDUs',
    icon: Zap,
    description: 'Infraestructura eléctrica y respaldo de energía',
    nodes: [
      { id: 'ups-dc-1', label: 'UPS-DC-01',   sublabel: '20kVA',        kind: 'ups',    status: 'online',   x: 3, y: 1, meta: { Capacidad: '20kVA', Carga: '68%', Batería: '100%' } },
      { id: 'ups-dc-2', label: 'UPS-DC-02',   sublabel: '20kVA',        kind: 'ups',    status: 'online',   x: 5, y: 1, meta: { Capacidad: '20kVA', Carga: '72%', Batería: '100%' } },
      { id: 'ups-mdf',  label: 'UPS-MDF-01',  sublabel: '3kVA',         kind: 'ups',    status: 'warning',  x: 1, y: 2, meta: { Capacidad: '3kVA',  Carga: '89%', Batería: '85%' } },
      { id: 'ups-idf2', label: 'UPS-IDF2-01', sublabel: '1kVA',         kind: 'ups',    status: 'online',   x: 0, y: 4, meta: { Capacidad: '1kVA',  Carga: '45%', Batería: '100%' } },
      { id: 'pdu-dc-1', label: 'PDU-DC-01',   sublabel: '32A 3F',       kind: 'asset',  status: 'online',   x: 3, y: 3, meta: { Amperaje: '32A', Fases: 3, Tomas: 24 } },
      { id: 'pdu-dc-2', label: 'PDU-DC-02',   sublabel: '32A 3F',       kind: 'asset',  status: 'online',   x: 5, y: 3, meta: { Amperaje: '32A', Fases: 3, Tomas: 24 } },
      { id: 'pdu-mdf',  label: 'PDU-MDF-01',  sublabel: '16A 1F',       kind: 'asset',  status: 'online',   x: 1, y: 4, meta: { Amperaje: '16A', Fases: 1, Tomas: 12 } },
      { id: 'gen',      label: 'Generador',   sublabel: '150kVA',       kind: 'server', status: 'online',   x: 3, y: 5, meta: { Capacidad: '150kVA', Combustible: 'Diesel', Estado: 'Standby' } },
    ],
    edges: [
      { from: 'gen',     to: 'ups-dc-1', style: 'solid', label: 'Bypass' },
      { from: 'gen',     to: 'ups-dc-2', style: 'solid', label: 'Bypass' },
      { from: 'ups-dc-1',to: 'pdu-dc-1', style: 'solid', label: 'A-side' },
      { from: 'ups-dc-2',to: 'pdu-dc-2', style: 'solid', label: 'B-side' },
      { from: 'ups-mdf', to: 'pdu-mdf',  style: 'solid' },
      { from: 'ups-idf2',to: 'pdu-mdf',  style: 'dashed' },
    ],
  },

  // ── Activos ────────────────────────────────────────────────────────────────
  {
    id: 'activos',
    label: 'Activos',
    icon: Package,
    description: 'Inventario general de activos tecnológicos',
    nodes: [
      { id: 'srv-1',  label: 'SRV-APP-01',  sublabel: 'App Server',    kind: 'server', status: 'online',   x: 2, y: 1, meta: { CPU: '32 cores', RAM: '128GB', OS: 'RHEL 9' } },
      { id: 'srv-2',  label: 'SRV-DB-01',   sublabel: 'DB Server',     kind: 'server', status: 'online',   x: 4, y: 1, meta: { CPU: '64 cores', RAM: '256GB', OS: 'RHEL 9' } },
      { id: 'srv-3',  label: 'SRV-BKP-01',  sublabel: 'Backup',        kind: 'server', status: 'warning',  x: 6, y: 1, meta: { CPU: '16 cores', RAM: '64GB',  OS: 'RHEL 9' } },
      { id: 'fw-1',   label: 'FW-CORE-01',  sublabel: 'Firewall',      kind: 'node',   status: 'online',   x: 3, y: 0, meta: { Modelo: 'Palo Alto PA-3220', Política: 'Producción' } },
      { id: 'fw-2',   label: 'FW-DMZ-01',   sublabel: 'DMZ',           kind: 'node',   status: 'online',   x: 5, y: 0, meta: { Modelo: 'Palo Alto PA-820',  Política: 'DMZ' } },
      { id: 'san-1',  label: 'SAN-01',      sublabel: 'Storage',       kind: 'asset',  status: 'online',   x: 2, y: 3, meta: { Capacidad: '100TB', Protocolo: 'FC 16G', RAID: '6' } },
      { id: 'san-2',  label: 'SAN-02',      sublabel: 'Storage DR',    kind: 'asset',  status: 'online',   x: 4, y: 3, meta: { Capacidad: '100TB', Protocolo: 'FC 16G', RAID: '6' } },
      { id: 'inet',   label: 'INTERNET',    sublabel: '',              kind: 'internet',status: 'online',  x: 4, y: 5, meta: {} },
    ],
    edges: [
      { from: 'inet',  to: 'fw-1',   style: 'fiber', label: 'WAN' },
      { from: 'inet',  to: 'fw-2',   style: 'fiber', label: 'WAN' },
      { from: 'fw-1',  to: 'srv-1',  style: 'solid' },
      { from: 'fw-1',  to: 'srv-2',  style: 'solid' },
      { from: 'fw-2',  to: 'srv-3',  style: 'solid' },
      { from: 'srv-1', to: 'san-1',  style: 'fiber', label: 'FC' },
      { from: 'srv-2', to: 'san-1',  style: 'fiber', label: 'FC' },
      { from: 'san-1', to: 'san-2',  style: 'fiber', label: 'Replica' },
    ],
  },
];

// ─── Status summary ───────────────────────────────────────────────────────────
function StatusSummary({ nodes }: { nodes: TopoNode[] }) {
  const counts = nodes.reduce((acc, n) => {
    acc[n.status] = (acc[n.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const items = [
    { key: 'online',   label: 'En línea',      color: '#31C48D', bg: 'rgba(49,196,141,0.08)',  border: 'rgba(49,196,141,0.2)' },
    { key: 'warning',  label: 'Atención',      color: '#F6A609', bg: 'rgba(246,166,9,0.08)',   border: 'rgba(246,166,9,0.2)' },
    { key: 'critical', label: 'Crítico',       color: '#F05252', bg: 'rgba(240,82,82,0.08)',   border: 'rgba(240,82,82,0.2)' },
    { key: 'offline',  label: 'Fuera de línea',color: '#9EA3C8', bg: 'rgba(158,163,200,0.08)', border: 'rgba(158,163,200,0.2)' },
    { key: 'planned',  label: 'Planeado',      color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.filter(i => counts[i.key]).map(i => (
        <div key={i.key} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px',
          borderRadius: 20,
          background: i.bg,
          border: `1px solid ${i.border}`,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: i.color, display: 'inline-block' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: i.color }}>{counts[i.key]}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-2, #5C6194)' }}>{i.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// Bandera: false = tenant nuevo sin datos reales
const HAS_REAL_DATA = false;

export default function TopologiaPage() {
  const [activeTab, setActiveTab] = useState('mdf-idf');
  const current = TABS.find(t => t.id === activeTab)!;

  if (!HAS_REAL_DATA) {
    return (
      <AppLayout title="Topología" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Topología' }]}>
        <Head><title>Topología — SKIA Platform</title></Head>
        <ModuleEmptyState
          icon="Network"
          title="Sin topología generada"
          description="La topología de red se genera automáticamente a partir de los equipos registrados. Agrega MDF/IDF, Switches y Backbone para visualizar el mapa isométrico 3D de tu red."
          features={[
            'Mapa isométrico interactivo 3D de la red',
            'Visualización por capa: MDF/IDF, Switches, Backbone, UPS',
            'Estado en tiempo real: en línea, atención, crítico',
            'Exportación del diagrama en PNG/SVG',
          ]}
          buttonLabel="Ir a registrar MDF/IDF"
          onAction={() => { window.location.href = '/infraestructura/mdf-idf'; }}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Topología"
      breadcrumb={[
        { label: 'Infraestructura' },
        { label: 'Topología' },
      ]}
    >
      <Head>
        <title>Topología — SKIA Platform</title>
      </Head>

      <div style={{ padding: '20px 24px', fontFamily: 'Inter, sans-serif' }}>

        {/* Page header */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1, #1A1D2E)', margin: 0, letterSpacing: '-0.02em' }}>
              Topología de Red
            </h1>
            <p style={{ color: 'var(--text-3, #9EA3C8)', fontSize: '0.84rem', marginTop: 4 }}>
              Vista isométrica 3D de la infraestructura de telecomunicaciones
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid var(--border, #DDE0EE)',
              background: 'var(--surface, #fff)',
              color: 'var(--text-2, #5C6194)',
              fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}>
              <Download size={14} /> Exportar
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid var(--border, #DDE0EE)',
              background: 'var(--surface, #fff)',
              color: 'var(--text-2, #5C6194)',
              fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}>
              <RefreshCw size={14} /> Actualizar
            </button>
          </div>
        </div>

        {/* Module tabs */}
        <div style={{
          display: 'flex', gap: 4, flexWrap: 'wrap',
          padding: '6px',
          background: 'var(--surface-2, #F4F5FB)',
          border: '1px solid var(--border-light, #E8EBF4)',
          borderRadius: 14,
          marginBottom: 16,
        }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10,
                  border: isActive ? '1px solid var(--border-light, #E8EBF4)' : '1px solid transparent',
                  background: isActive ? 'var(--surface, #fff)' : 'transparent',
                  color: isActive ? '#4361EE' : 'var(--text-2, #5C6194)',
                  fontSize: '0.81rem', fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer', transition: 'all 140ms ease',
                  boxShadow: isActive ? '0 1px 4px rgba(67,97,238,0.1)' : 'none',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Module info bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border-light, #E8EBF4)',
          borderRadius: 12,
          marginBottom: 14,
          flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(67,97,238,0.08)',
              border: '1px solid rgba(67,97,238,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {(() => { const Icon = current.icon; return <Icon size={15} color="#4361EE" />; })()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1, #1A1D2E)' }}>{current.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3, #9EA3C8)' }}>{current.description}</div>
            </div>
          </div>
          <StatusSummary nodes={current.nodes} />
        </div>

        {/* Isometric canvas */}
        <IsometricTopology
          nodes={current.nodes}
          edges={current.edges}
          title={`Topología — ${current.label}`}
          height={540}
        />

        {/* Tip */}
        <div style={{
          marginTop: 10, padding: '8px 14px',
          background: 'rgba(67,97,238,0.04)',
          border: '1px solid rgba(67,97,238,0.1)',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Map size={13} color="#4361EE" />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3, #9EA3C8)', fontFamily: 'Inter, sans-serif' }}>
            Haz clic en un nodo para ver detalles · Scroll para hacer zoom · Arrastra para mover la vista
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
