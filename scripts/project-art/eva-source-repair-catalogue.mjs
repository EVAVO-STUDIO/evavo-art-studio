function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

const sourceEdit = ({
  taskId,
  frameId,
  sourcePath,
  sourceGitBlobSha1,
  issue,
  references,
}) => ({
  taskId,
  kind: 'masked-source-edit',
  frameId,
  sourcePath,
  sourceGitBlobSha1,
  issue,
  references: references.map(([referenceFrameId, referenceGitBlobSha1]) => ({
    referenceFrameId,
    referenceGitBlobSha1,
  })),
  runtimeFindings: [frameId],
  targetRelativePath: `source-candidates/${frameId}.png`,
  editPolicy: {
    scope: 'hands-only-defect-mask',
    preserveFaceIdentity: true,
    preserveBodyPose: true,
    preserveWardrobe: true,
    preserveCanvas: true,
    preserveOutsideMask: true,
    highInputFidelityRequired: true,
    actualRgbaAlphaRequired: true,
    checkerboardMatteHaloRejected: true,
    candidateOnly: true,
  },
});

export const EVA_SOURCE_REPAIR_TASK_CATALOGUE = freezeDeep([
  sourceEdit({
    taskId: 'repair-eva-153620-05',
    frameId: 'eva-20260809-153620-frame-05',
    sourcePath:
      'assets/eva-female/ChatGPT Image Aug 9, 2026, 03_36_21 PM (5).png',
    sourceGitBlobSha1: 'e333296677c2a9bd13c2d8da52db871204099b19',
    issue: 'open-palm-finger-separation',
    references: [
      ['eva-20260809-153620-frame-04', '98bab4007e9006856942dfff860a3cefbaa5abdf'],
      ['eva-20260809-153620-frame-06', '512ce0828d56748f7832475bdd0a83b344c77ba7'],
    ],
  }),
  sourceEdit({
    taskId: 'repair-eva-154001-05',
    frameId: 'eva-20260809-154001-frame-05',
    sourcePath:
      'assets/eva-female/ChatGPT Image Aug 9, 2026, 03_40_02 PM (5).png',
    sourceGitBlobSha1: 'a7f53f7e08667d411ebc04c6ab59b2026b0e2030',
    issue: 'open-palm-finger-separation',
    references: [
      ['eva-20260809-154001-frame-04', '6bb4a852601af805d523bbeb7679c7b9afb8f31d'],
      ['eva-20260809-154001-frame-06', '6b3ee8328e4c14016069f0256174945f962aad52'],
    ],
  }),
  sourceEdit({
    taskId: 'repair-eva-154325-05',
    frameId: 'eva-20260809-154325-frame-05',
    sourcePath:
      'assets/eva-female/ChatGPT Image Aug 9, 2026, 03_43_27 PM (5).png',
    sourceGitBlobSha1: '69d7265a9d4907283bbdadaf607a64385cc43866',
    issue: 'open-palm-finger-separation',
    references: [
      ['eva-20260809-154325-frame-04', 'bb894e180b82b8fe34709e44cbe50551c3107f8f'],
      ['eva-20260809-154325-frame-06', '386f35fa154f9a7a2b0b93576ac43daf5a58c2ee'],
    ],
  }),
  sourceEdit({
    taskId: 'repair-eva-154857-04',
    frameId: 'eva-20260809-154857-frame-04',
    sourcePath:
      'assets/eva-female/ChatGPT Image Aug 9, 2026, 03_48_58 PM (4).png',
    sourceGitBlobSha1: 'b1da8a05227c888d89876d92d5dcc473012afb80',
    issue: 'bilateral-finger-fusion',
    references: [
      ['eva-20260809-154857-frame-03', '05b3c6c4bc7e43c428b4f25e1bc100e033084379'],
      ['eva-20260809-154857-frame-05', 'd5e7499b00f3adb2ecc3b9a0183292ded0b2d896'],
    ],
  }),
  sourceEdit({
    taskId: 'repair-eva-161524-05',
    frameId: 'eva-20260809-161524-frame-05',
    sourcePath:
      'assets/eva-female/ChatGPT Image Aug 9, 2026, 04_15_27 PM (5).png',
    sourceGitBlobSha1: '0225163b396fcc40381a14e9d29940ef9653f4ff',
    issue: 'elongated-finger-anatomy',
    references: [
      ['eva-20260809-161524-frame-04', '38145eb2e9419fb036644a5425121fad1629849c'],
      ['eva-20260809-161524-frame-06', '1e66d6f6d663abcf1907eaebb14883a936e49f6e'],
    ],
  }),
  {
    taskId: 'regenerate-wave-between-04-01',
    kind: 'derived-inbetween-regeneration',
    frameId: 'wave-between-04-frame-01',
    sourcePath: null,
    sourceGitBlobSha1: null,
    issue: 'transition-hand-shape',
    references: [
      {
        referenceFrameId: 'eva-20260809-161022-frame-04',
        referenceGitBlobSha1: '24eecc2dfb9529f2a58570fa834c092621a3cd52',
      },
      {
        referenceFrameId: 'eva-20260809-161022-frame-05',
        referenceGitBlobSha1: '8142bcc55a93d0691849c11b077e69850906ba4c',
      },
    ],
    runtimeFindings: ['wave-between-04-frame-01'],
    targetRelativePath: 'derived-candidates/wave-between-04-frame-01.png',
    editPolicy: {
      scope: 'regenerate-from-verified-endpoints',
      preserveFaceIdentity: true,
      preserveBodyPose: true,
      preserveWardrobe: true,
      preserveCanvas: true,
      preserveOutsideMask: true,
      highInputFidelityRequired: true,
      actualRgbaAlphaRequired: true,
      checkerboardMatteHaloRejected: true,
      candidateOnly: true,
    },
  },
]);

export const EVA_SOURCE_REPAIR_TASK_CATALOGUE_SHA256 =
  'fd96197701ad5878518d4c70dec0cfea4df06ab480cdebd7083881a8f010d831';
