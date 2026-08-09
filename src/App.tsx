import React, { useState, useEffect } from 'react';
import { AndroidFrame } from './components/layout/AndroidFrame';
import { Header } from './components/navigation/Header';
import { BottomNav, NavTab } from './components/navigation/BottomNav';
import { HomeScreen } from './components/screens/HomeScreen';
import { VoiceModelScreen } from './components/screens/VoiceModelScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { AboutScreen } from './components/screens/AboutScreen';
import { TestSuiteModal } from './components/tests/TestSuiteModal';
import { InstalledModel, ModelStatus } from './types/model';
import { modelStorage } from './services/storage/modelStorage';
import { ModelValidator } from './services/validator/modelValidator';
import { bembaTtsEngine } from './services/engine/BembaTtsEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [installedModel, setInstalledModel] = useState<InstalledModel | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('NO_MODEL');
  const [isTestSuiteOpen, setIsTestSuiteOpen] = useState<boolean>(false);

  const loadModel = async () => {
    try {
      const meta = await modelStorage.getModelMetadata();
      const modelBuffer = await modelStorage.getModelFile('models/bemba/model.onnx');
      const inspection = ModelValidator.inspectOnnxArtifact(modelBuffer);

      if (inspection.classification === 'INVALID / HTML ARTIFACT' || (modelBuffer && !inspection.isValid)) {
        setInstalledModel(meta);
        setModelStatus('INVALID');
      } else if (inspection.isValid && meta && meta.onnxValid) {
        setInstalledModel(meta);
        setModelStatus('READY');
        await bembaTtsEngine.initialize(meta.name);
      } else {
        setInstalledModel(null);
        setModelStatus('NO_MODEL');
      }
    } catch {
      setInstalledModel(null);
      setModelStatus('NO_MODEL');
    }
  };

  useEffect(() => {
    loadModel();
  }, []);

  return (
    <AndroidFrame activeTab={activeTab}>
      <Header
        modelStatus={modelStatus}
        activeModelName={installedModel?.name}
        onRunTests={() => setIsTestSuiteOpen(true)}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'home' && (
          <HomeScreen
            modelStatus={modelStatus}
            installedModel={installedModel}
            onNavigateToModel={() => setActiveTab('model')}
          />
        )}

        {activeTab === 'model' && (
          <VoiceModelScreen
            modelStatus={modelStatus}
            installedModel={installedModel}
            onModelUpdated={loadModel}
            onStatusChange={setModelStatus}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsScreen installedModel={installedModel} />
        )}

        {activeTab === 'about' && (
          <AboutScreen />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hasModelInstalled={modelStatus === 'READY'}
      />

      <TestSuiteModal
        isOpen={isTestSuiteOpen}
        onClose={() => setIsTestSuiteOpen(false)}
        onModelUpdated={loadModel}
      />
    </AndroidFrame>
  );
}
