import {
  isPayablePending,
  isReceivablePending,
  payableOutstanding,
  receivableOutstanding,
  transactionEffect,
  transactionExpense,
  transactionIncome,
} from '../utils/financeLedger'

let passed = 0
let failed = 0

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++
  }
  else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

assert('título em aberto mantém o valor integral pendente', receivableOutstanding({ amount: 1000 }) === 1000)
assert('conta parcialmente paga considera somente o saldo restante', payableOutstanding({ amount: 1000, paidAmount: 350 }) === 650)
assert('saldo a pagar nunca fica negativo', payableOutstanding({ amount: 1000, paidAmount: 1200 }) === 0)
assert('pagamento parcial continua pendente', isPayablePending({ status: 'partial' }))
assert('conta paga não entra na projeção', !isPayablePending({ status: 'paid' }))
assert('baixa parcial considera somente o saldo restante', receivableOutstanding({ amount: 1000, receivedAmount: 350 }) === 650)
assert('saldo nunca fica negativo', receivableOutstanding({ amount: 1000, receivedAmount: 1200 }) === 0)
assert('status parcial continua pendente', isReceivablePending({ status: 'partial' }))
assert('status recebido não entra na projeção', !isReceivablePending({ status: 'received' }))
assert('receita aumenta o caixa', transactionEffect({ type: 'income', amount: 500 }) === 500)
assert('despesa reduz o caixa', transactionEffect({ type: 'expense', amount: 200 }) === -200)
assert('estorno de receita reduz o caixa', transactionEffect({ type: 'income', amount: 500, isReversal: true }) === -500)
assert('estorno de despesa aumenta o caixa', transactionEffect({ type: 'expense', amount: 200, isReversal: true }) === 200)
assert('DRE reconhece somente receitas no agregador de entradas', transactionIncome({ type: 'expense', amount: 200 }) === 0)
assert('estorno reduz receitas realizadas', transactionIncome({ type: 'income', amount: 500, isReversal: true }) === -500)
assert('estorno reduz despesas realizadas', transactionExpense({ type: 'expense', amount: 200, isReversal: true }) === -200)

console.log(`\nFinance ledger: ${passed} passaram, ${failed} falharam.`)
if (failed > 0)
  process.exit(1)
