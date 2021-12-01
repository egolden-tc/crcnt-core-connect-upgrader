global class SampleContextProvider implements dcorealpha.ContextProvider {
  global Map<String, Object> getContext(String userId, String recordId) {
   Map<String, Object> context = dcorealpha.DefaultContextProvider.getDefaultContext(
      userId,
      recordId
    );
      return context;
  }
}