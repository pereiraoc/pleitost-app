// Fixtures compartilhadas dos testes de Recursos do mundo (config no formato
// do contexto.json da POA + notas mínimas de cada semântica).
import type { Recurso, RecursosCfg } from '../../src/recursos/types'

export const cfg: RecursosCfg = {
  raiz: 'Contexto/Recursos',
  abas: [
    { nome: 'Transporte', papel: 'transporte' },
    { nome: 'Moradia', papel: 'moradia' },
    { nome: 'Alimentação', papel: 'alimentacao' },
  ],
  precoEm: 'moeda',
  niveis: ['Miserável', 'Humilde', 'Classe Média Baixa', 'Classe Média', 'Classe Média Alta', 'Classe Alta'],
  tipos: { passagem: 'Passagem', estilo: 'Estilo de Vida', recarga: 'Recarga' },
  ofertas: { campo: 'Serviços', aba: 'Serviços' },
  disponibilidade: {
    'Pequena Cidade': { niveis: [1, 3], quantidade: 0.6 },
    'Grande Cidade': { niveis: [2, 5], quantidade: 1 },
    Capital: { niveis: [3, 6], quantidade: 1 },
    Iluminada: { niveis: [1, 6], quantidade: 1.5 },
  },
}
const FATOR = 1000

export function rec(p: Partial<Recurso> & Pick<Recurso, 'nome' | 'aba' | 'tipo' | 'preco' | 'cobranca'>): Recurso {
  return { id: `Contexto/Recursos/${p.aba}/${p.nome}`, marca: '', onde: [], resumo: '', ...p }
}
export const onibus = rec({ nome: 'Passagem de Ônibus', aba: 'Transporte', tipo: 'Passagem', preco: 50, cobranca: 'viagem', nivel: 3 })
export const recarga = rec({ nome: 'Recarga TRI', aba: 'Transporte', tipo: 'Recarga', preco: 1000, cobranca: 'única', nivel: 3 })
export const carajas = rec({ nome: 'Gurgel Carajás', aba: 'Transporte', tipo: 'Veículo', preco: 400000, cobranca: 'única', usado: 150000, nivel: 5 })
export const aluguelDia = rec({ nome: 'Gurgel de Aluguel', aba: 'Transporte', tipo: 'Aluguel', preco: 4000, cobranca: 'dia', nivel: 4 })
export const gasolina = rec({ nome: 'Gasolina Ipiranga', aba: 'Transporte', tipo: 'Combustível', preco: 30, cobranca: 'litro', nivel: 4 })
export const kitnet = rec({ nome: 'Kitnet do Aeromóvel', aba: 'Moradia', tipo: 'Aluguel', preco: 6000, cobranca: 'mês', compra: 600000, nivel: 4 })
export const pensao = rec({ nome: 'Noite na Pensão sem Placa', aba: 'Moradia', tipo: 'Hotel', preco: 150, cobranca: 'noite', nivel: 2 })
export const polar = rec({ nome: 'Polar Tradicional', aba: 'Alimentação', tipo: 'Bebida', preco: 40, cobranca: 'unidade', nivel: 2 })
export const uisque = rec({ nome: 'Uísque de Contrabando', aba: 'Alimentação', tipo: 'Bebida', preco: 4000, cobranca: 'unidade', nivel: 5 })
export const cesta = rec({ nome: 'Cesta Básica Zaffari', aba: 'Alimentação', tipo: 'Mantimento', preco: 2500, cobranca: 'mês', nivel: 3 })
export const estilos = {
  t3: rec({ nome: 'Transporte Classe Média Baixa', aba: 'Transporte', tipo: 'Estilo de Vida', preco: 2000, cobranca: 'mês', nivel: 3 }),
  t4: rec({ nome: 'Transporte Classe Média', aba: 'Transporte', tipo: 'Estilo de Vida', preco: 4000, cobranca: 'mês', nivel: 4 }),
  m4: rec({ nome: 'Moradia Classe Média', aba: 'Moradia', tipo: 'Estilo de Vida', preco: 6000, cobranca: 'mês', nivel: 4 }),
  a2: rec({ nome: 'Alimentação Humilde', aba: 'Alimentação', tipo: 'Estilo de Vida', preco: 1500, cobranca: 'mês', nivel: 2 }),
  a5: rec({ nome: 'Alimentação Classe Média Alta', aba: 'Alimentação', tipo: 'Estilo de Vida', preco: 9000, cobranca: 'mês', nivel: 5 }),
}
export const porNome = new Map([onibus, recarga, carajas, aluguelDia, gasolina, kitnet, pensao, polar, uisque, cesta, ...Object.values(estilos)].map((r) => [r.nome, r]))

