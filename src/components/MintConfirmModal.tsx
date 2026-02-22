'use client';

import {
  TransactionConfirmModal,
  buildMintTransaction,
} from '@/components/TransactionConfirmModal';

export interface MintConfirmDetails {
  collectionName: string;
  price: number;
  phaseName?: string;
  requiresAllowlistProof?: boolean;
  isCandyMachine?: boolean;
}

interface MintConfirmModalProps {
  open: boolean;
  details: MintConfirmDetails;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MintConfirmModal({ open, details, onConfirm, onCancel }: MintConfirmModalProps) {
  const txDetails = buildMintTransaction(details);

  return (
    <TransactionConfirmModal
      open={open}
      {...txDetails}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
