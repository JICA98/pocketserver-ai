import {StyleSheet} from 'react-native';
import {EdgeInsets} from 'react-native-safe-area-context';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme, insets: EdgeInsets) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flexGrow: 1,
      padding: theme.spacing.default,
      paddingBottom: theme.spacing.default + insets.bottom,
      gap: theme.spacing.default,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borders.default,
      padding: theme.spacing.default * 1.5,
      shadowColor: theme.colors.shadow,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
      gap: theme.spacing.default,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.default,
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    title: {
      ...theme.fonts.titleLarge,
      color: theme.colors.onSurface,
    },
    subtitle: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onSurfaceVariant,
    },
    caption: {
      ...theme.fonts.bodySmall,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.8,
    },
    sectionTitle: {
      ...theme.fonts.titleMedium,
      color: theme.colors.onSurface,
      fontWeight: 'bold',
      marginBottom: theme.spacing.default / 4,
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: theme.spacing.default,
      marginTop: theme.spacing.default / 2,
    },
    button: {
      flex: 1,
    },
    textInput: {
      backgroundColor: theme.colors.surfaceContainerLowest,
      borderRadius: theme.borders.default,
      padding: theme.spacing.default,
      color: theme.colors.onSurface,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
      ...theme.fonts.bodyMedium,
    },
    addressCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surfaceContainerHigh,
      padding: theme.spacing.default,
      borderRadius: theme.borders.default,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
    },
    addressText: {
      ...theme.fonts.bodyMedium,
      color: theme.colors.onSurface,
      flex: 1,
      marginRight: theme.spacing.default,
    },
    apiKeyContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceContainerHigh,
      paddingHorizontal: theme.spacing.default,
      borderRadius: theme.borders.default,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
      height: 48,
    },
    apiKeyText: {
      ...theme.fonts.bodyMedium,
      fontFamily: 'monospace',
      color: theme.colors.onSurface,
      flex: 1,
    },
    logConsole: {
      backgroundColor: '#1E1E1E',
      borderRadius: theme.borders.default,
      padding: theme.spacing.default,
      height: 200,
    },
    logText: {
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#00FF00',
      marginBottom: 4,
    },
    emptyLogText: {
      color: '#888888',
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 80,
    },
    exampleCodeContainer: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      padding: theme.spacing.default,
      borderRadius: theme.borders.default,
      marginTop: theme.spacing.default / 2,
    },
    exampleCodeText: {
      ...theme.fonts.bodySmall,
      fontFamily: 'monospace',
      color: theme.colors.onSurface,
    },
  });
